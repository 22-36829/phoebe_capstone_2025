import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Search, AlertCircle, Bug, Lightbulb, HelpCircle, Clock, CheckCircle, XCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportAPI } from '../../services/api';

const ChatPage = () => {
  const { token, user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  
  // Spam prevention constants
  const MAX_MESSAGE_LENGTH = 500;
  const MIN_MESSAGE_LENGTH = 1;
  const MESSAGE_COOLDOWN_SECONDS = 3; // 3 seconds between messages
  
  // Update cooldown timer every 100ms
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        if (!lastMessageTime) {
          setCooldownRemaining(0);
          return;
        }
        const timeSinceLastMessage = (Date.now() - lastMessageTime) / 1000;
        const remaining = timeSinceLastMessage >= MESSAGE_COOLDOWN_SECONDS ? 0 : MESSAGE_COOLDOWN_SECONDS - timeSinceLastMessage;
        setCooldownRemaining(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
        }
      }, 100);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining, lastMessageTime, MESSAGE_COOLDOWN_SECONDS]);

  useEffect(() => {
    loadTickets();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, typeFilter, priorityFilter]);

  const loadStats = async () => {
    if (!token) return;
    try {
      const res = await SupportAPI.getStats(token);
      if (res.success) setStats(res.stats);
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  };


  const loadTickets = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      
      const res = await SupportAPI.listTickets(params, token);
      if (res.success) {
        let filtered = res.tickets || [];
        if (priorityFilter !== 'all') {
          filtered = filtered.filter(t => t.priority === priorityFilter);
        }
        if (searchTerm) {
          filtered = filtered.filter(t => 
            t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.pharmacy_name?.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        setTickets(filtered);
      }
    } catch (e) {
      setError(e.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, typeFilter, priorityFilter, searchTerm]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // WebSocket functionality removed per latest requirements

  const loadTicketDetails = async (ticketId) => {
    try {
      const res = await SupportAPI.getTicket(ticketId, token);
      if (res.success) {
        setSelectedTicket(res);
      }
    } catch (e) {
      setError(e.message || 'Failed to load ticket details');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    
    // Validation checks
    const trimmedMessage = newMessage.trim();
    
    if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      setError('Message cannot be empty');
      return;
    }
    
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      setError(`Message exceeds the maximum length of ${MAX_MESSAGE_LENGTH} characters. Current: ${trimmedMessage.length}`);
      return;
    }
    
    // Rate limiting check
    if (lastMessageTime) {
      const timeSinceLastMessage = (Date.now() - lastMessageTime) / 1000;
      if (timeSinceLastMessage < MESSAGE_COOLDOWN_SECONDS) {
        const remainingTime = (MESSAGE_COOLDOWN_SECONDS - timeSinceLastMessage).toFixed(1);
        setError(`Please wait ${remainingTime} more second(s) before sending another message.`);
        return;
      }
    }
    
    try {
      setError('');
      setSendingMessage(true);
      const res = await SupportAPI.addMessage(selectedTicket.ticket.id, { message: trimmedMessage }, token);
      if (res.success) {
        setNewMessage('');
        const now = Date.now();
        setLastMessageTime(now);
        setCooldownRemaining(MESSAGE_COOLDOWN_SECONDS);
        // WebSocket will handle the real-time update, but we still refresh to ensure consistency
        loadTicketDetails(selectedTicket.ticket.id);
        loadTickets();
      }
    } catch (e) {
      setError(e.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };
  
  const getRemainingCooldown = () => {
    if (!lastMessageTime) return 0;
    const timeSinceLastMessage = (Date.now() - lastMessageTime) / 1000;
    if (timeSinceLastMessage >= MESSAGE_COOLDOWN_SECONDS) return 0;
    return MESSAGE_COOLDOWN_SECONDS - timeSinceLastMessage;
  };
  
  const canSendMessage = () => {
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || trimmedMessage.length < MIN_MESSAGE_LENGTH || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return false;
    }
    if (getRemainingCooldown() > 0) {
      return false;
    }
    if (sendingMessage) {
      return false;
    }
    return true;
  };

  const handleUpdateTicket = async (updates) => {
    if (!selectedTicket) return;
    try {
      setUpdatingTicket(true);
      setError('');
      const res = await SupportAPI.updateTicket(selectedTicket.ticket.id, updates, token);
      if (res.success) {
        loadTicketDetails(selectedTicket.ticket.id);
        loadTickets();
        loadStats();
      }
    } catch (e) {
      setError(e.message || 'Failed to update ticket');
    } finally {
      setUpdatingTicket(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'bug_report': return <Bug className="w-4 h-4" />;
      case 'feature_request': return <Lightbulb className="w-4 h-4" />;
      default: return <HelpCircle className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'bug_report': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      case 'feature_request': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      open: { icon: <Clock className="w-3.5 h-3.5" />, class: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800', label: 'Open' },
      in_progress: { icon: <AlertCircle className="w-3.5 h-3.5" />, class: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800', label: 'In Progress' },
      resolved: { icon: <CheckCircle className="w-3.5 h-3.5" />, class: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800', label: 'Resolved' },
      closed: { icon: <XCircle className="w-3.5 h-3.5" />, class: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700', label: 'Closed' },
    };
    const badge = badges[status] || badges.open;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${badge.class} shadow-sm`}>
        {badge.icon}
        {badge.label}
      </span>
    );
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'text-gray-600 dark:text-gray-400',
      medium: 'text-blue-600 dark:text-blue-400',
      high: 'text-orange-600 dark:text-orange-400',
      urgent: 'text-red-600 dark:text-red-400 font-semibold',
    };
    return colors[priority] || colors.medium;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Header - Matching Other Admin Pages */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-7 lg:p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Support Center</h1>
        <p className="text-purple-100">Manage and respond to customer support tickets</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Compact Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Open</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.open_count || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">In Progress</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.in_progress_count || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Urgent</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.urgent_count || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.total_count || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-gray-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200"
          >
            <option value="all">All Types</option>
            <option value="support">Support</option>
            <option value="bug_report">Bug Report</option>
            <option value="feature_request">Feature Request</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Tickets List (Left) and Chat (Right) - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Side - Tickets List */}
        <div className="space-y-2 max-h-[calc(100vh-20rem)] overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-2 mb-2 border border-gray-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase">Tickets List</h3>
          </div>
          {loading ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-slate-800">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-200 dark:border-purple-900 border-t-purple-600 dark:border-t-purple-400 mb-3"></div>
                <p className="text-gray-600 dark:text-slate-400 text-xs">Loading...</p>
              </div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-slate-800 text-center">
              <MessageSquare className="w-8 h-8 text-gray-400 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-gray-700 dark:text-slate-300 font-medium text-sm mb-1">No tickets found</p>
              <p className="text-gray-500 dark:text-slate-500 text-xs">Try adjusting your filters</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => loadTicketDetails(ticket.id)}
                className={`bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border cursor-pointer transition-all ${
                  selectedTicket?.ticket.id === ticket.id
                    ? 'border-purple-500 ring-2 ring-purple-100 dark:ring-purple-900/30 bg-purple-50/50 dark:bg-purple-900/10'
                    : 'border-gray-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getTypeColor(ticket.type)}`}>
                        {getTypeIcon(ticket.type)}
                        {ticket.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                      {getStatusBadge(ticket.status)}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-xs line-clamp-2 mb-1 leading-tight">{ticket.subject}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-slate-400 mb-1">
                      <span className="font-mono">#{ticket.ticket_number}</span>
                      <span>•</span>
                      <span>{ticket.pharmacy_name || 'Unknown'}</span>
                      <span>•</span>
                      <span className={`font-medium ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority.toUpperCase()}
                      </span>
                    </div>
                    {ticket.message_count > 0 && (
                      <span className="text-[10px] text-gray-500 dark:text-slate-400">
                        {ticket.message_count} message{ticket.message_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Side - Messenger Style Chat */}
        <div>
          {selectedTicket ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md border border-gray-200 dark:border-slate-800 flex flex-col h-[calc(100vh-12rem)] overflow-hidden">
              {/* Minimal Chat Header - Like Messenger */}
              <div className="px-4 py-2.5 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 dark:from-purple-600 dark:to-indigo-700 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                      <span className="text-white text-sm font-bold">
                        {selectedTicket.ticket.pharmacy_name?.charAt(0).toUpperCase() || 'T'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{selectedTicket.ticket.subject}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        {getStatusBadge(selectedTicket.ticket.status)}
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">
                          #{selectedTicket.ticket.ticket_number}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Quick Actions Dropdown */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={selectedTicket.ticket.status}
                      onChange={(e) => handleUpdateTicket({ status: e.target.value })}
                      disabled={updatingTicket}
                      className="px-2 py-1 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select
                      value={selectedTicket.ticket.priority}
                      onChange={(e) => handleUpdateTicket({ priority: e.target.value })}
                      disabled={updatingTicket}
                      className="px-2 py-1 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                
                {/* Toggleable Description - Compact */}
                {selectedTicket.ticket.description && (
                  <button
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    className="w-full mt-2 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-slate-800 rounded px-2 py-1 transition-colors"
                  >
                    <span className="text-xs text-gray-600 dark:text-slate-400">Ticket Description</span>
                    {descriptionExpanded ? (
                      <ChevronUp className="w-3 h-3 text-gray-500 dark:text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-gray-500 dark:text-slate-400" />
                    )}
                  </button>
                )}
                {descriptionExpanded && selectedTicket.ticket.description && (
                  <div className="mt-2 px-2 py-1.5 bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">
                    <p className="text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{selectedTicket.ticket.description}</p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">by {selectedTicket.ticket.created_by_name || 'Unknown'}</p>
                  </div>
                )}
              </div>

              {/* Compact Chat Section - Most Important */}
              <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50 dark:bg-slate-900">
                {/* Compact Conversation Header */}
                <div className="sticky top-0 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-3 py-1.5 z-10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                      <div className="w-1 h-3 bg-purple-500 rounded-full"></div>
                      Messages
                    </h3>
                    <span className="text-[10px] text-gray-500 dark:text-slate-400">
                      {selectedTicket.messages?.length || 0}
                    </span>
                  </div>
                </div>

                {/* Messenger Style Messages */}
                <div className="px-3 py-2 space-y-2">
                  {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                    selectedTicket.messages.map((msg, index) => {
                      const showDateSeparator = index === 0 || 
                        new Date(msg.created_at).toDateString() !== new Date(selectedTicket.messages[index - 1].created_at).toDateString();
                      
                      // Check if this message is from the current user
                      const isCurrentUser = user && msg.user_id === user.id;
                      
                      return (
                        <div key={msg.id}>
                          {/* Date Separator */}
                          {showDateSeparator && (
                            <div className="flex items-center gap-2 my-3">
                              <div className="flex-1 h-px bg-gray-300 dark:bg-slate-700"></div>
                              <span className="text-[10px] font-medium text-gray-500 dark:text-slate-400 px-2 py-0.5 bg-gray-100 dark:bg-slate-800 rounded">
                                {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <div className="flex-1 h-px bg-gray-300 dark:bg-slate-700"></div>
                            </div>
                          )}
                          
                          {/* Messenger Style Message - Right for current user, Left for others */}
                          <div className={`flex gap-2 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Avatar - Only show for other users */}
                            {!isCurrentUser && (
                              <div className="flex-shrink-0">
                                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 dark:from-purple-600 dark:to-indigo-700 rounded-full flex items-center justify-center shadow-sm">
                                  <span className="text-white text-xs font-bold">
                                    {msg.user_name?.charAt(0).toUpperCase() || 'U'}
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            {/* Message Bubble */}
                            <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} max-w-[75%]`}>
                              {/* Sender name and timestamp - Only show for other users */}
                              {!isCurrentUser && (
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="font-semibold text-xs text-gray-700 dark:text-slate-300">{msg.user_name || 'Unknown'}</span>
                                  {msg.is_internal && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded font-medium">Internal</span>
                                  )}
                                </div>
                              )}
                              
                              {/* Message bubble with different colors */}
                              <div className={`rounded-2xl px-3 py-2 text-xs shadow-sm ${
                                isCurrentUser
                                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500 text-white'
                                  : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700'
                              }`}>
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                              </div>
                              
                              {/* Timestamp - Small, below message */}
                              <span className={`text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 px-1 ${isCurrentUser ? 'text-right' : 'text-left'}`}>
                                {formatDate(msg.created_at)}
                              </span>
                            </div>
                            
                            {/* Spacer for current user messages to align properly */}
                            {isCurrentUser && <div className="w-8 flex-shrink-0"></div>}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8">
                      <MessageSquare className="w-8 h-8 text-gray-300 dark:text-slate-700 mx-auto mb-2" />
                      <p className="text-xs text-gray-500 dark:text-slate-400">No messages yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Message Input Area - Professional Design */}
              {selectedTicket.ticket.status !== 'closed' && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
                  {error && error.includes('wait') && (
                    <div className="mb-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  
                  {/* Input Container */}
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 border border-gray-200 dark:border-slate-700">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">Reply</label>
                      <div className="flex items-center gap-3">
                        {cooldownRemaining > 0 && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3.5 h-3.5" />
                            {cooldownRemaining.toFixed(1)}s
                          </span>
                        )}
                        <span className={`text-xs font-medium ${
                          newMessage.length > MAX_MESSAGE_LENGTH 
                            ? 'text-red-600 dark:text-red-400' 
                            : newMessage.length > MAX_MESSAGE_LENGTH * 0.8 
                            ? 'text-orange-600 dark:text-orange-400' 
                            : 'text-gray-500 dark:text-slate-400'
                        }`}>
                          {newMessage.length}/{MAX_MESSAGE_LENGTH}
                        </span>
                      </div>
                    </div>

                    {/* Full Width Textarea */}
                    <div className="mb-3">
                      <textarea
                        value={newMessage}
                        onChange={(e) => {
                          if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                            setNewMessage(e.target.value);
                            setError('');
                          }
                        }}
                        placeholder="Type your response..."
                        rows={3}
                        maxLength={MAX_MESSAGE_LENGTH}
                        className={`w-full px-4 py-3 text-sm border-2 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200 resize-none transition-all ${
                          newMessage.length > MAX_MESSAGE_LENGTH 
                            ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500' 
                            : 'border-gray-300 dark:border-slate-600'
                        }`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            if (canSendMessage()) {
                              handleSendMessage();
                            }
                          }
                        }}
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-gray-400 dark:text-slate-500 ml-1">Ctrl+Enter to send</p>
                        {/* Send Button - Right Aligned Under Textarea */}
                        <button
                          onClick={handleSendMessage}
                          disabled={!canSendMessage()}
                          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold transition-all shadow-lg hover:shadow-xl disabled:shadow-none transform hover:scale-105 disabled:transform-none"
                        >
                          {sendingMessage ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              <span>Sending</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              <span>Send</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-slate-800 text-center flex items-center justify-center h-[calc(100vh-12rem)]">
              <div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-lg flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <MessageSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-gray-800 dark:text-slate-200 font-semibold text-sm mb-1">Select a ticket to view details</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">Choose a ticket from the list</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
