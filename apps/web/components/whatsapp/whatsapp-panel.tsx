'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Connection {
  id: string;
  connection_type: string;
  phone_number: string | null;
  is_connected: boolean;
  last_connected_at: string | null;
}

interface Conversation {
  id: string;
  phone_number: string;
  contact_name: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_bot_active: boolean;
  patients: { first_name: string; last_name: string } | null;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string | null;
  sent_at: string | null;
  status: string | null;
  is_bot_response: boolean;
}

interface Props {
  slug: string;
  tenantId: string;
  connection: Connection | null;
  conversations: Conversation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return d.toLocaleDateString('es-EC', { weekday: 'short' });
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionStatus({ connection }: { connection: Connection | null }) {
  if (!connection) {
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center justify-between">
        <div>
          <p className="font-semibold">WhatsApp no configurado</p>
          <p className="text-xs mt-0.5 text-orange-700">
            Configura una conexión para recibir y enviar mensajes
          </p>
        </div>
        <Button size="sm" variant="outline" className="border-orange-300 text-orange-800 hover:bg-orange-100 flex-shrink-0">
          Configurar
        </Button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border px-4 py-2.5 text-sm flex items-center gap-3 ${
      connection.is_connected
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-red-200 bg-red-50 text-red-800'
    }`}>
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        connection.is_connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
      }`} />
      <div className="flex-1">
        <span className="font-semibold">
          {connection.is_connected ? 'Conectado' : 'Desconectado'}
        </span>
        {connection.phone_number && (
          <span className="ml-2 text-xs opacity-80">{connection.phone_number}</span>
        )}
        <span className="ml-2 text-xs opacity-70">
          ({connection.connection_type === 'official_api' ? 'API Oficial' : 'Baileys'})
        </span>
      </div>
      {!connection.is_connected && (
        <Button size="sm" variant="outline" className="flex-shrink-0 text-xs border-red-300 text-red-700 hover:bg-red-100">
          Reconectar
        </Button>
      )}
    </div>
  );
}

function ConversationItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const displayName = conv.patients
    ? `${conv.patients.first_name} ${conv.patients.last_name}`
    : conv.contact_name ?? conv.phone_number;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b transition-colors ${
        isActive ? 'bg-blue-50 border-l-2 border-l-[#1E40AF]' : 'hover:bg-gray-50'
      }`}
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-[#1E40AF]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-[#1E40AF] font-semibold text-sm">
          {displayName.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm text-gray-900 truncate">{displayName}</p>
          <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{conv.phone_number}</p>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {!conv.is_bot_active && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Manual</span>
            )}
            {conv.unread_count > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#1E40AF] text-white text-xs flex items-center justify-center font-bold">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function ChatView({
  conversation,
  tenantId,
}: {
  conversation: Conversation;
  tenantId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const displayName = conversation.patients
    ? `${conversation.patients.first_name} ${conversation.patients.last_name}`
    : conversation.contact_name ?? conversation.phone_number;

  useEffect(() => {
    setLoading(true);
    const supabase = createClient();

    async function loadMessages() {
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('id, direction, message_type, content, sent_at, status, is_bot_response')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: true })
        .limit(100);
      setMessages((data as Message[]) ?? []);
      setLoading(false);
    }

    void loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`wa_messages_${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [conversation.id, tenantId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!messageText.trim() || sending) return;
    setSending(true);
    const supabase = createClient();

    const { data: inserted } = await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversation.id,
        direction: 'outbound',
        message_type: 'text',
        content: messageText.trim(),
        sent_at: new Date().toISOString(),
        status: 'pending',
        is_bot_response: false,
      })
      .select('id, direction, message_type, content, sent_at, status, is_bot_response')
      .single();

    if (inserted) setMessages((prev) => [...prev, inserted as Message]);
    setMessageText('');
    setSending(false);
  }

  async function toggleBot() {
    const supabase = createClient();
    await supabase
      .from('whatsapp_conversations')
      .update({ is_bot_active: !conversation.is_bot_active })
      .eq('id', conversation.id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-5 py-3 border-b bg-white flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{displayName}</p>
          <p className="text-xs text-muted-foreground">{conversation.phone_number}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBot}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              conversation.is_bot_active
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            }`}
          >
            {conversation.is_bot_active ? '🤖 Bot activo' : '👤 Manual'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Cargando mensajes...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Sin mensajes</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  msg.direction === 'outbound'
                    ? 'bg-[#1E40AF] text-white rounded-br-sm'
                    : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                }`}
              >
                <p>{msg.content}</p>
                <div className={`flex items-center gap-1 mt-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  {msg.is_bot_response && (
                    <span className={`text-[10px] ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-muted-foreground'}`}>
                      🤖
                    </span>
                  )}
                  <span className={`text-[10px] ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-muted-foreground'}`}>
                    {formatTime(msg.sent_at)}
                  </span>
                  {msg.direction === 'outbound' && msg.status && (
                    <span className="text-[10px] text-blue-200">
                      {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t bg-white flex items-center gap-3">
        <Input
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="Escribe un mensaje..."
          className="flex-1 h-10 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
          disabled={sending}
        />
        <Button
          onClick={handleSend}
          disabled={!messageText.trim() || sending}
          className="h-10 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-4"
        >
          {sending ? '⟳' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function WhatsAppPanel({ slug: _slug, tenantId, connection, conversations: initialConversations }: Props) {
  const conversations = initialConversations;
  const [activeConvId, setActiveConvId]   = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [search, setSearch] = useState('');

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  const filtered = conversations.filter((c) => {
    const name = c.patients
      ? `${c.patients.first_name} ${c.patients.last_name}`
      : c.contact_name ?? '';
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone_number.includes(search)
    );
  });

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="space-y-4 h-[calc(100vh-160px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            WhatsApp
            {totalUnread > 0 && (
              <span className="ml-2 text-base font-normal text-[#1E40AF]">
                {totalUnread} sin leer
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Conversaciones con pacientes</p>
        </div>
      </div>

      <ConnectionStatus connection={connection} />

      {/* Chat layout */}
      <div className="flex flex-1 rounded-xl border overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 border-r flex flex-col bg-white">
          {/* Search */}
          <div className="p-3 border-b">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="h-9 text-sm border-gray-200 bg-gray-50"
            />
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-2xl mb-2">💬</p>
                <p className="text-sm">
                  {search ? 'Sin resultados' : 'Sin conversaciones'}
                </p>
              </div>
            ) : (
              filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConvId}
                  onClick={() => setActiveConvId(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 min-w-0">
          {activeConv ? (
            <ChatView conversation={activeConv} tenantId={tenantId} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <p className="text-5xl mb-3">💬</p>
                <p className="font-medium">Selecciona una conversación</p>
                <p className="text-sm mt-1">para ver los mensajes</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
