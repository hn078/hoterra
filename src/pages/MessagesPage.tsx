import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Download,
  FileText,
  Hotel,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { CountBadge } from '@/components/ui/CountBadge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ChatMessage, ChatMessageDocument, ChatMessageFileAttachment, Conversation, Document, User } from '@/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/types';
import { cn, fileToBase64, formatFileSize, getInitials, timeAgo } from '@/lib/utils';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const POLL_MS = 5000;

function ConversationIcon({ type }: { type: Conversation['type'] }) {
  if (type === 'HOTEL') return <Hotel className="h-4 w-4" />;
  if (type === 'DEPARTMENT') return <Building2 className="h-4 w-4" />;
  return <Users className="h-4 w-4" />;
}

export function MessagesPage() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachedDocument, setAttachedDocument] = useState<ChatMessageDocument | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [pickerDocs, setPickerDocs] = useState<Document[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [staff, setStaff] = useState<User[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingConversations(true);
    try {
      const items = await api.getConversations();
      setConversations(items);
      setSelectedId((current) => current ?? items[0]?.id ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await api.getConversationMessages(conversationId, { limit: 100 });
      setMessages(res.data);
      await api.markConversationRead(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadConversations(true);
      if (selectedId) loadMessages(selectedId, true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadMessages, selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openNewDm = () => {
    setShowNewDm(true);
    setStaffLoading(true);
    api
      .getUsers()
      .then((users) => setStaff(users.filter((u) => u.id !== user?.id && u.isActive !== false)))
      .catch(console.error)
      .finally(() => setStaffLoading(false));
  };

  const startDm = async (targetId: string) => {
    try {
      const conv = await api.startDirectConversation(targetId);
      setShowNewDm(false);
      await loadConversations(true);
      setSelectedId(conv.id);
    } catch (err) {
      console.error(err);
    }
  };

  const openDocPicker = () => {
    setShowDocPicker(true);
    setDocSearch('');
    setPickerLoading(true);
    api
      .getDocuments({ limit: '50' })
      .then((res) => setPickerDocs(res.data))
      .catch(console.error)
      .finally(() => setPickerLoading(false));
  };

  const searchDocuments = useCallback(async (query: string) => {
    setPickerLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (query.trim()) params.search = query.trim();
      const res = await api.getDocuments(params);
      setPickerDocs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showDocPicker) return;
    const timer = window.setTimeout(() => {
      searchDocuments(docSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [docSearch, showDocPicker, searchDocuments]);

  const selectDocument = (doc: Document) => {
    setAttachedFile(null);
    setAttachedDocument({
      id: doc.id,
      title: doc.title,
      code: doc.code,
      status: doc.status,
    });
    setShowDocPicker(false);
    setShowAttachMenu(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert('File exceeds maximum size of 10 MB');
      return;
    }
    setAttachedDocument(null);
    setAttachedFile(file);
    setShowAttachMenu(false);
  };

  const hasAttachment = !!attachedDocument || !!attachedFile;

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !hasAttachment) || !selectedId || sending) return;

    setSending(true);
    const sentText = text;
    const sentDoc = attachedDocument;
    const sentFile = attachedFile;
    setDraft('');
    setAttachedDocument(null);
    setAttachedFile(null);
    try {
      let filePayload: { fileName: string; fileType: string; data: string } | undefined;
      if (sentFile) {
        const data = await fileToBase64(sentFile);
        filePayload = {
          fileName: sentFile.name,
          fileType: sentFile.type || sentFile.name.split('.').pop() || 'bin',
          data,
        };
      }

      const msg = await api.sendMessage(selectedId, sentText, {
        ...(sentDoc ? { documentId: sentDoc.id } : {}),
        ...(filePayload ? { file: filePayload } : {}),
      });
      setMessages((prev) => [...prev, msg]);
      const preview =
        sentText ||
        (sentDoc ? `📎 ${sentDoc.title}` : sentFile ? `📎 ${sentFile.name}` : '');
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                lastMessage: {
                  content: preview,
                  createdAt: msg.createdAt,
                  senderName: `${msg.sender.firstName} ${msg.sender.lastName}`,
                },
                updatedAt: msg.createdAt,
              }
            : c
        )
      );
    } catch (err) {
      console.error(err);
      setDraft(sentText);
      setAttachedDocument(sentDoc);
      setAttachedFile(sentFile);
      alert(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const hotelChats = conversations.filter((c) => c.type === 'HOTEL');
  const deptChats = conversations.filter((c) => c.type === 'DEPARTMENT');
  const directChats = conversations.filter((c) => c.type === 'DIRECT');

  return (
    <div className="flex h-full flex-col">
      <Header title="Messages" subtitle="Chat with your team across the hotel" />

      <div className="flex flex-1 overflow-hidden p-4 md:p-6">
        <div className="flex w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-hoterra-navy">Conversations</h2>
              <button
                type="button"
                onClick={openNewDm}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-hoterra-navy"
                title="New direct message"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loadingConversations ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">Loading...</p>
              ) : conversations.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">No conversations yet</p>
              ) : (
                <>
                  {hotelChats.length > 0 && (
                    <ConversationGroup title="Hotel" items={hotelChats} selectedId={selectedId} onSelect={setSelectedId} />
                  )}
                  {deptChats.length > 0 && (
                    <ConversationGroup title="My Department" items={deptChats} selectedId={selectedId} onSelect={setSelectedId} />
                  )}
                  {directChats.length > 0 && (
                    <ConversationGroup title="Direct Messages" items={directChats} selectedId={selectedId} onSelect={setSelectedId} />
                  )}
                </>
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-navy/10 text-hoterra-navy">
                    <ConversationIcon type={selected.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-hoterra-navy">{selected.name}</h3>
                    <p className="text-xs text-gray-500">
                      {selected.type === 'HOTEL' && 'All staff members'}
                      {selected.type === 'DEPARTMENT' && selected.department?.name}
                      {selected.type === 'DIRECT' && 'Private conversation'}
                    </p>
                  </div>
                </div>

                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto bg-hoterra-offwhite/40 px-5 py-4">
                  {loadingMessages ? (
                    <p className="py-8 text-center text-sm text-gray-400">Loading messages...</p>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <MessageSquare className="mb-3 h-10 w-10 text-gray-300" />
                      <p className="text-sm text-gray-500">No messages yet. Start the conversation.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => {
                        const isMine = msg.senderId === user?.id;
                        return (
                          <div
                            key={msg.id}
                            className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                          >
                            <div
                              className={cn(
                                'max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm',
                                isMine
                                  ? 'rounded-br-md bg-hoterra-navy text-white'
                                  : 'rounded-bl-md border border-gray-200 bg-white text-gray-800'
                              )}
                            >
                              {!isMine && (
                                <div className="mb-1 text-xs font-medium text-hoterra-steel">
                                  {msg.sender.firstName} {msg.sender.lastName}
                                </div>
                              )}
                              {msg.content && (
                                <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                              )}
                              {msg.document && (
                                <MessageDocumentCard
                                  document={msg.document}
                                  isMine={isMine}
                                  className={msg.content ? 'mt-2' : undefined}
                                />
                              )}
                              {msg.fileAttachment && (
                                <MessageFileCard
                                  attachment={msg.fileAttachment}
                                  conversationId={msg.conversationId}
                                  messageId={msg.id}
                                  isMine={isMine}
                                  className={msg.content || msg.document ? 'mt-2' : undefined}
                                />
                              )}
                              <div
                                className={cn(
                                  'mt-1 text-[10px]',
                                  isMine ? 'text-white/60' : 'text-gray-400'
                                )}
                              >
                                {timeAgo(msg.createdAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 bg-white px-5 py-4">
                  {attachedDocument && (
                    <div className="mb-3 flex items-start gap-2">
                      <MessageDocumentCard document={attachedDocument} compact />
                      <button
                        type="button"
                        onClick={() => setAttachedDocument(null)}
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {attachedFile && (
                    <div className="mb-3 flex items-start gap-2">
                      <MessageFilePreview file={attachedFile} />
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <div className="relative" ref={attachMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowAttachMenu((v) => !v)}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2.5 text-gray-500 transition-colors hover:border-hoterra-steel hover:text-hoterra-navy"
                        title="Attach"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      {showAttachMenu && (
                        <div className="absolute bottom-full left-0 z-10 mb-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Upload className="h-4 w-4 text-hoterra-navy" />
                            Upload from computer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAttachMenu(false);
                              openDocPicker();
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <FileText className="h-4 w-4 text-hoterra-navy" />
                            Attach system document
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
                    />
                    <button
                      type="submit"
                      disabled={(!draft.trim() && !hasAttachment) || sending}
                      className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-hoterra-steel disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <MessageSquare className="mb-3 h-12 w-12 text-gray-300" />
                <p className="text-sm text-gray-500">Select a conversation to start chatting</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {showDocPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="font-semibold text-hoterra-navy">Attach Document</h3>
              <button
                type="button"
                onClick={() => setShowDocPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-gray-200 px-5 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Search by title or code..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {pickerLoading ? (
                <p className="py-8 text-center text-sm text-gray-400">Loading documents...</p>
              ) : pickerDocs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No documents found</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pickerDocs.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => selectDocument(doc)}
                        className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-gray-50"
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hoterra-navy/10 text-hoterra-navy">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-hoterra-navy">{doc.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">{doc.code}</span>
                            <span
                              className={cn(
                                'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                                STATUS_COLORS[doc.status]
                              )}
                            >
                              {STATUS_LABELS[doc.status]}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewDm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="font-semibold text-hoterra-navy">New Direct Message</h3>
              <button
                type="button"
                onClick={() => setShowNewDm(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {staffLoading ? (
                <p className="py-8 text-center text-sm text-gray-400">Loading staff...</p>
              ) : staff.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No staff available</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {staff.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => startDm(member.id)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-hoterra-steel text-xs font-semibold text-white">
                          {getInitials(member.firstName, member.lastName)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-hoterra-navy">
                            {member.firstName} {member.lastName}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {member.department?.name ?? member.email}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageFilePreview({ file }: { file: File }) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <Paperclip className="h-4 w-4 shrink-0 text-hoterra-navy" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-hoterra-navy">{file.name}</div>
        <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
      </div>
    </div>
  );
}

function MessageFileCard({
  attachment,
  conversationId,
  messageId,
  isMine = false,
  compact = false,
  className,
}: {
  attachment: ChatMessageFileAttachment;
  conversationId: string;
  messageId: string;
  isMine?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await api.downloadMessageAttachment(conversationId, messageId, attachment.fileName);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className={cn(
        'block w-full rounded-lg border text-left transition-colors',
        compact
          ? 'flex-1 border-gray-200 bg-gray-50 px-3 py-2 hover:border-hoterra-steel hover:bg-white'
          : isMine
            ? 'border-white/20 bg-white/10 px-3 py-2.5 hover:bg-white/15'
            : 'border-gray-200 bg-gray-50 px-3 py-2.5 hover:border-hoterra-steel hover:bg-white',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <Paperclip
          className={cn('h-4 w-4 shrink-0', isMine && !compact ? 'text-white/80' : 'text-hoterra-navy')}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm font-medium',
              isMine && !compact ? 'text-white' : 'text-hoterra-navy'
            )}
          >
            {attachment.fileName}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className={cn('text-xs', isMine && !compact ? 'text-white/70' : 'text-gray-500')}>
              {formatFileSize(attachment.fileSize)}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                isMine && !compact ? 'text-white/80' : 'text-hoterra-steel'
              )}
            >
              <Download className="h-3 w-3" />
              {downloading ? 'Downloading...' : 'Download'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function MessageDocumentCard({
  document,
  isMine = false,
  compact = false,
  className,
}: {
  document: ChatMessageDocument;
  isMine?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={`/documents/${document.id}`}
      className={cn(
        'block rounded-lg border transition-colors',
        compact
          ? 'flex-1 border-gray-200 bg-gray-50 px-3 py-2 hover:border-hoterra-steel hover:bg-white'
          : isMine
            ? 'border-white/20 bg-white/10 px-3 py-2.5 hover:bg-white/15'
            : 'border-gray-200 bg-gray-50 px-3 py-2.5 hover:border-hoterra-steel hover:bg-white',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <FileText
          className={cn('h-4 w-4 shrink-0', isMine && !compact ? 'text-white/80' : 'text-hoterra-navy')}
        />
        <div className="min-w-0">
          <div
            className={cn(
              'truncate text-sm font-medium',
              isMine && !compact ? 'text-white' : 'text-hoterra-navy'
            )}
          >
            {document.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn('text-xs', isMine && !compact ? 'text-white/70' : 'text-gray-500')}>
              {document.code}
            </span>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                STATUS_COLORS[document.status]
              )}
            >
              {STATUS_LABELS[document.status]}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ConversationGroup({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </div>
      <ul className="space-y-0.5">
        {items.map((conv) => (
          <li key={conv.id}>
            <button
              type="button"
              onClick={() => onSelect(conv.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                selectedId === conv.id
                  ? 'bg-white shadow-sm ring-1 ring-hoterra-steel/30'
                  : 'hover:bg-white/80'
              )}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-hoterra-navy"
                style={{
                  backgroundColor: conv.department?.color
                    ? `${conv.department.color}22`
                    : 'rgba(41, 70, 96, 0.1)',
                }}
              >
                <ConversationIcon type={conv.type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-hoterra-navy">{conv.name}</span>
                  {conv.unreadCount > 0 && <CountBadge count={conv.unreadCount} max={9} />}
                </div>
                {conv.lastMessage && (
                  <p className="truncate text-xs text-gray-500">
                    {conv.lastMessage.senderName}: {conv.lastMessage.content}
                  </p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
