"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSocket } from "@/hooks/use-socket";

interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

interface Split {
  userId: string;
  owedAmount: number;
  paidAmount: number;
  user: {
    name: string;
  };
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  createdById: string;
  groupId: string;
  creator: {
    name: string;
  };
  splits: Split[];
}

interface Settlement {
  id: string;
  amount: number;
  date: string;
  fromUser: {
    id: string;
    name: string;
  };
  toUser: {
    id: string;
    name: string;
  };
}

interface Balance {
  userId: string;
  balance: number;
}

interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

interface ChatMessage {
  id: string;
  message: string;
  userId: string;
  createdAt: string;
  user: {
    name: string;
    avatarUrl: string;
  };
}

export default function GroupDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = React.use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const socket = useSocket();

  // Core Data
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active UI states
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Invite Members
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Settle Up
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleFromUser, setSettleFromUser] = useState("");
  const [settleToUser, setSettleToUser] = useState("");
  const [settleAmount, setSettleAmount] = useState(0);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Add Expense
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState<string>("");
  const [expCategory, setExpCategory] = useState("General");
  const [expPayerId, setExpPayerId] = useState("");
  const [expSplitMethod, setExpSplitMethod] = useState<"EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARES">("EQUAL");
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, boolean>>({});
  const [participantSplits, setParticipantSplits] = useState<Record<string, { value: string }>>({});
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const fetchGroupDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) {
        throw new Error("Failed to load group details");
      }
      const data = await res.json();
      setGroup(data.group);
      setMembers(data.members);
      setExpenses(data.expenses);
      setSettlements(data.settlements);
      setBalances(data.balances);
      setSimplifiedDebts(data.simplifiedDebts);

      // Pre-fill dialogs default payer
      if (session?.user?.id) {
        setExpPayerId(session.user.id);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchGroupDetails();
    }
  }, [status, groupId, router]);

  // Pre-fill participants checklist when members list changes
  useEffect(() => {
    if (members.length > 0) {
      const initialParticipants: Record<string, boolean> = {};
      const initialSplits: Record<string, { value: string }> = {};
      members.forEach((m) => {
        initialParticipants[m.id] = true;
        initialSplits[m.id] = { value: "" };
      });
      setSelectedParticipants(initialParticipants);
      setParticipantSplits(initialSplits);
    }
  }, [members]);

  // Socket chat subscriptions & fallback polling for serverless
  useEffect(() => {
    if (!selectedExpenseId) return;

    // Fetch initial chat history
    fetch(`/api/groups/${groupId}/chats?expenseId=${selectedExpenseId}`)
      .then((res) => res.json())
      .then((data) => setChatMessages(data))
      .catch((err) => console.error("Failed to load chat history", err));

    let isSubscribed = true;

    // Use WebSockets if socket instance is connected
    if (socket) {
      const roomName = `group-${groupId}-expense-${selectedExpenseId}`;
      socket.emit("join-room", roomName);

      const handleReceiveMessage = (message: ChatMessage) => {
        if (isSubscribed) {
          setChatMessages((prev) => [...prev, message]);
        }
      };

      socket.on("receive-message", handleReceiveMessage);

      // If socket is connected, we return cleanups and avoid polling
      return () => {
        isSubscribed = false;
        socket.emit("leave-room", roomName);
        socket.off("receive-message", handleReceiveMessage);
      };
    }

    // Fallback polling every 5 seconds if socket connection is unavailable (Vercel serverless)
    const pollInterval = setInterval(() => {
      fetch(`/api/groups/${groupId}/chats?expenseId=${selectedExpenseId}`)
        .then((res) => res.json())
        .then((data) => {
          if (isSubscribed) {
            setChatMessages((prev) => {
              // Only update if lengths differ to prevent scroll jumps
              if (prev.length !== data.length) {
                return data;
              }
              return prev;
            });
          }
        })
        .catch((err) => console.error("Failed to poll chat messages", err));
    }, 5000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [socket, selectedExpenseId, groupId]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // User search autocomplete
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out existing members
          const filtered = data.filter((u: Member) => !members.some((m) => m.id === u.id));
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error("Failed to search users", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, members]);

  // Handle invite user
  const handleInviteUser = async (user: Member) => {
    setInviteLoading(true);
    setInviteError(null);

    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to invite user");
      }

      setMembers((prev) => [...prev, user]);
      setSearchResults([]);
      setSearchQuery("");
      setShowInviteModal(false);
      fetchGroupDetails();
    } catch (err: any) {
      setInviteError(err.message || "Failed to invite user");
    } finally {
      setInviteLoading(false);
    }
  };

  // Submit Expense
  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError(null);

    const amountNum = parseFloat(expAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setExpenseError("Please enter a valid positive amount");
      return;
    }

    if (!expDesc.trim()) {
      setExpenseError("Please enter a description");
      return;
    }

    const participantList = Object.entries(selectedParticipants)
      .filter(([_, checked]) => checked)
      .map(([userId]) => {
        const splitVal = participantSplits[userId]?.value;
        const participantObj: any = { userId };

        if (expSplitMethod === "UNEQUAL") {
          participantObj.amountOwed = parseFloat(splitVal) || 0;
        } else if (expSplitMethod === "PERCENTAGE") {
          participantObj.percentage = parseFloat(splitVal) || 0;
        } else if (expSplitMethod === "SHARES") {
          participantObj.shares = parseFloat(splitVal) || 0;
        }
        return participantObj;
      });

    if (participantList.length === 0) {
      setExpenseError("At least one participant must be selected");
      return;
    }

    setExpenseLoading(true);

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: expDesc,
          amount: amountNum,
          category: expCategory,
          groupId,
          payerId: expPayerId,
          splitMethod: expSplitMethod,
          participants: participantList
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add expense");
      }

      setShowExpenseModal(false);
      setExpDesc("");
      setExpAmount("");
      setExpCategory("General");
      fetchGroupDetails();
    } catch (err: any) {
      setExpenseError(err.message || "Failed to add expense");
    } finally {
      setExpenseLoading(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        throw new Error("Failed to delete expense");
      }

      if (selectedExpenseId === expenseId) {
        setSelectedExpenseId(null);
      }
      fetchGroupDetails();
    } catch (err: any) {
      alert(err.message || "Failed to delete expense");
    }
  };

  // Submit Settlement
  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettleError(null);

    if (!settleFromUser || !settleToUser) {
      setSettleError("Please select both payer and recipient");
      return;
    }

    if (settleFromUser === settleToUser) {
      setSettleError("Payer and recipient cannot be the same user");
      return;
    }

    if (settleAmount <= 0) {
      setSettleError("Settlement amount must be positive");
      return;
    }

    setSettleLoading(true);

    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          fromUserId: settleFromUser,
          toUserId: settleToUser,
          amount: settleAmount
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to record payment");
      }

      setShowSettleModal(false);
      setSettleAmount(0);
      fetchGroupDetails();
    } catch (err: any) {
      setSettleError(err.message || "Failed to record payment");
    } finally {
      setSettleLoading(false);
    }
  };

  // Submit Chat Message
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedExpenseId) return;

    const messageText = newMessage;
    setNewMessage("");

    try {
      const res = await fetch(`/api/groups/${groupId}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          expenseId: selectedExpenseId
        })
      });

      const savedMsg = await res.json();

      if (res.ok) {
        // Broadcast via WebSockets
        if (socket) {
          socket.emit("send-message", {
            roomId: `group-${groupId}-expense-${selectedExpenseId}`,
            message: savedMsg
          });
        }
        // Append locally
        setChatMessages((prev) => [...prev, savedMsg]);
      }
    } catch (err) {
      console.error("Failed to send chat message", err);
    }
  };

  const getMemberName = (id: string) => {
    return members.find((m) => m.id === id)?.name || "Unknown User";
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-teal-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm font-medium text-slate-400">Loading group details...</p>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center text-slate-100">
        <div className="glass-card p-8 rounded-2xl max-w-md text-center border border-red-500/20">
          <h2 className="text-lg font-bold text-red-400 mb-2">Group Not Found</h2>
          <p className="text-sm text-slate-400 mb-6">{error || "The requested group does not exist."}</p>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 hover:border-slate-700 transition-colors inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-mesh text-slate-100 flex flex-col font-sans pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors">
            <span>←</span>
            <span className="font-medium text-sm">Dashboard</span>
          </Link>
          <h1 className="font-bold text-slate-100 text-sm hidden sm:block truncate max-w-xs">{group.name}</h1>
          <span className="text-xs text-slate-500">WanderLust Hub</span>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-6xl mx-auto px-6 mt-8 w-full flex-1 flex flex-col gap-8">
        
        {/* Banner Card */}
        <section className="glass-card p-6 rounded-3xl border border-slate-800/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-5">
            {group.avatarUrl ? (
              <img src={group.avatarUrl} alt={group.name} className="w-16 h-16 rounded-2xl border border-slate-800 bg-slate-900" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-black text-2xl">
                {group.name.charAt(0)}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-100">{group.name}</h2>
              <p className="text-sm text-slate-400 mt-1">{group.description || "Tahoe trip budget sharing."}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-xs transition-colors cursor-pointer"
            >
              + Invite Friend
            </button>
            <button
              onClick={() => {
                setShowSettleModal(true);
                // Pre-populate if debt exists
                if (simplifiedDebts.length > 0) {
                  setSettleFromUser(simplifiedDebts[0].fromUserId);
                  setSettleToUser(simplifiedDebts[0].toUserId);
                  setSettleAmount(simplifiedDebts[0].amount);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-teal-400 hover:text-teal-300 font-medium text-xs transition-colors cursor-pointer"
            >
              Settle Up
            </button>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              Add Expense
            </button>
          </div>
        </section>

        {/* Dynamic Splits Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Expenses Log */}
          <section className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-200">Expenses Log</h3>
              <span className="text-xs text-slate-500">{expenses.length} transaction{expenses.length !== 1 ? "s" : ""}</span>
            </div>

            {expenses.length === 0 ? (
              <div className="glass-card p-16 rounded-2xl border border-slate-800/40 text-center flex flex-col items-center">
                <span className="text-2xl mb-4">💸</span>
                <h4 className="text-sm font-bold text-slate-300 mb-1">No shared bills yet</h4>
                <p className="text-xs text-slate-500 max-w-xs mb-6">
                  Add groceries, travel tickets, or dinner splits to calculate who owes what.
                </p>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors cursor-pointer"
                >
                  Add Expense
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {expenses.map((expense) => {
                  const isExpanded = selectedExpenseId === expense.id;
                  const formattedDate = new Date(expense.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric"
                  });

                  // Find payer info from splits
                  const payerSplit = expense.splits.find((s) => s.paidAmount > 0);
                  const payerName = payerSplit ? (payerSplit.userId === session?.user?.id ? "You" : payerSplit.user.name) : expense.creator.name;

                  // Find current user owed amount
                  const userSplit = expense.splits.find((s) => s.userId === session?.user?.id);
                  const userOwesAmount = userSplit ? userSplit.owedAmount : 0;
                  const userPaidAmount = userSplit ? userSplit.paidAmount : 0;

                  return (
                    <div
                      key={expense.id}
                      className={`glass-card rounded-2xl border transition-all ${
                        isExpanded ? "border-slate-700/60 ring-1 ring-slate-800" : "border-slate-800/40 hover:border-slate-800"
                      }`}
                    >
                      {/* Top collapsed row */}
                      <div
                        onClick={() => setSelectedExpenseId(isExpanded ? null : expense.id)}
                        className="p-5 flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center justify-center shrink-0 w-11 h-11 bg-slate-900 border border-slate-800/80 rounded-xl text-center">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                              {formattedDate.split(" ")[0]}
                            </span>
                            <span className="text-sm font-bold text-slate-300">
                              {formattedDate.split(" ")[1]}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-100 text-sm line-clamp-1">{expense.description}</h4>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded mt-1.5 inline-block">
                              {expense.category}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Paid</p>
                            <p className="text-sm font-bold text-slate-200 mt-0.5">${expense.amount.toFixed(2)}</p>
                          </div>
                          <div className="text-right w-24">
                            {userPaidAmount > 0 ? (
                              <>
                                <p className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider">You Lent</p>
                                <p className="text-sm font-bold text-teal-400 mt-0.5">
                                  +${(userPaidAmount - userOwesAmount).toFixed(2)}
                                </p>
                              </>
                            ) : userOwesAmount > 0 ? (
                              <>
                                <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">You Owe</p>
                                <p className="text-sm font-bold text-amber-500 mt-0.5">
                                  -${userOwesAmount.toFixed(2)}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Not split</p>
                                <p className="text-sm text-slate-400 mt-0.5">$0.00</p>
                              </>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteExpense(expense.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-900 transition-colors shrink-0 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Expanded Splits and WebSockets Chat */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-3 border-t border-slate-850 grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Splits breakdowns */}
                          <div className="flex flex-col gap-3">
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Splits Breakdown</h5>
                            <div className="flex flex-col gap-2.5">
                              {expense.splits.map((split) => (
                                <div key={split.userId} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-850/60 last:border-0">
                                  <span className="text-slate-300">
                                    {split.userId === session?.user?.id ? "You" : split.user.name}
                                  </span>
                                  <div className="text-right">
                                    {split.paidAmount > 0 && (
                                      <span className="text-[10px] text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded font-semibold mr-2">
                                        Paid ${split.paidAmount.toFixed(2)}
                                      </span>
                                    )}
                                    <span className="text-slate-400">Owes ${split.owedAmount.toFixed(2)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Chat board */}
                          <div className="glass-card rounded-xl border border-slate-800/60 p-4 flex flex-col h-64">
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Expense Chat</h5>
                            
                            {/* Message history */}
                            <div className="flex-1 overflow-y-auto mb-3 space-y-2 pr-1">
                              {chatMessages.length === 0 ? (
                                <p className="text-[10px] text-slate-500 text-center py-8">
                                  No discussion yet. Leave a note or confirm details.
                                </p>
                              ) : (
                                chatMessages.map((msg) => {
                                  const isMe = msg.userId === session?.user?.id;
                                  return (
                                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                                      <div className={`p-2.5 rounded-xl text-xs max-w-[85%] ${
                                        isMe ? "bg-teal-600/90 text-white rounded-br-none" : "bg-slate-900 text-slate-200 rounded-bl-none border border-slate-800"
                                      }`}>
                                        {!isMe && <p className="text-[9px] font-bold text-teal-400 mb-0.5">{msg.user.name}</p>}
                                        <p className="leading-relaxed">{msg.message}</p>
                                      </div>
                                      <span className="text-[8px] text-slate-650 mt-0.5">
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                              <div ref={chatEndRef} />
                            </div>

                            {/* Chat submit */}
                            <form onSubmit={handleSendChatMessage} className="flex gap-2">
                              <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Write a note..."
                                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                              />
                              <button
                                type="submit"
                                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors cursor-pointer"
                              >
                                Send
                              </button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Group details summaries */}
          <aside className="flex flex-col gap-6">
            
            {/* Net balances panel */}
            <section className="glass-card p-6 rounded-2xl border border-slate-800/40 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-200">Group Balances</h3>
              <div className="flex flex-col gap-3">
                {members.map((member) => {
                  const balanceObj = balances.find((b) => b.userId === member.id);
                  const balanceVal = balanceObj ? balanceObj.balance : 0;
                  const isMe = member.id === session?.user?.id;

                  return (
                    <div key={member.id} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.name} className="w-6 h-6 rounded-full border border-slate-800 bg-slate-900" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-[10px]">
                            {member.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-slate-350">{member.name} {isMe && "(You)"}</span>
                      </div>
                      <div>
                        {balanceVal > 0 ? (
                          <span className="text-teal-400 font-semibold">+${balanceVal.toFixed(2)}</span>
                        ) : balanceVal < 0 ? (
                          <span className="text-amber-500 font-semibold">-${Math.abs(balanceVal).toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-500">settled up</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Debt simplification matches panel */}
            <section className="glass-card p-6 rounded-2xl border border-slate-800/40 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-200">Simplified Debts</h3>
              {simplifiedDebts.length === 0 ? (
                <p className="text-xs text-slate-500">No debts to resolve. Everyone is settled up!</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {simplifiedDebts.map((debt, idx) => (
                    <div key={idx} className="text-xs flex flex-col gap-1 border-b border-slate-850/60 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold">{getMemberName(debt.fromUserId)}</span>
                        <span className="text-slate-500">owes</span>
                        <span className="font-semibold">{getMemberName(debt.toUserId)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] mt-1">
                        <span className="text-amber-500 font-bold">${debt.amount.toFixed(2)}</span>
                        <button
                          onClick={() => {
                            setSettleFromUser(debt.fromUserId);
                            setSettleToUser(debt.toUserId);
                            setSettleAmount(debt.amount);
                            setShowSettleModal(true);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-teal-400 cursor-pointer"
                        >
                          Settle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-slate-850 relative">
            <button
              onClick={() => {
                setShowInviteModal(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 text-sm cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-slate-100 mb-4">Invite Member</h2>

            {inviteError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {inviteError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Search user by Name or Email
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type email or name (min 2 chars)..."
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              {searchResults.length > 0 && (
                <div className="border border-slate-850 rounded-lg bg-slate-900 max-h-48 overflow-y-auto divide-y divide-slate-850">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleInviteUser(user)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800 transition-colors text-xs text-slate-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="w-5 h-5 rounded-full" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[9px]">
                            {user.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-bold">{user.name}</p>
                          <p className="text-[10px] text-slate-400">{user.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-teal-400 font-bold">+ Add</span>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim().length >= 2 && searchResults.length === 0 && !inviteLoading && (
                <p className="text-xs text-slate-500 text-center py-4">No matching registered users found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settle Up Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-slate-850 relative">
            <button
              onClick={() => setShowSettleModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 text-sm cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-slate-100 mb-4">Record a Payment</h2>

            {settleError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {settleError}
              </div>
            )}

            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  From (Payer)
                </label>
                <select
                  value={settleFromUser}
                  onChange={(e) => setSettleFromUser(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-teal-500"
                >
                  <option value="">Select payer</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  To (Recipient)
                </label>
                <select
                  value={settleToUser}
                  onChange={(e) => setSettleToUser(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-teal-500"
                >
                  <option value="">Select recipient</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settleAmount || ""}
                  onChange={(e) => setSettleAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-350 font-medium text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settleLoading}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {settleLoading ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 overflow-y-auto py-8">
          <div className="w-full max-w-xl glass-card rounded-2xl p-6 border border-slate-850 relative my-auto">
            <button
              onClick={() => setShowExpenseModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 text-sm cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-slate-100 mb-4">Add Shared Bill</h2>

            {expenseError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {expenseError}
              </div>
            )}

            <form onSubmit={handleAddExpenseSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    placeholder="e.g. Groceries, Gas"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Total Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Category
                  </label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none"
                  >
                    <option value="General">General</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Food">Food & Dining</option>
                    <option value="Lodging">Lodging</option>
                    <option value="Transport">Transport</option>
                    <option value="Entertainment">Entertainment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Paid By
                  </label>
                  <select
                    value={expPayerId}
                    onChange={(e) => setExpPayerId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.id === session?.user?.id ? "You" : m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Split Method
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(["EQUAL", "UNEQUAL", "PERCENTAGE", "SHARES"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setExpSplitMethod(method)}
                      className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                        expSplitMethod === method
                          ? "bg-teal-500/10 border-teal-500 text-teal-400 font-bold"
                          : "border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Splits inputs */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Split Details per Member
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2.5 pr-2">
                  {members.map((member) => {
                    const isChecked = selectedParticipants[member.id] || false;
                    return (
                      <div key={member.id} className="flex items-center justify-between text-xs gap-4">
                        <label className="flex items-center gap-2 text-slate-300">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setSelectedParticipants((prev) => ({ ...prev, [member.id]: e.target.checked }))
                            }
                            className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-800 text-teal-500 focus:ring-0"
                          />
                          <span>{member.name}</span>
                        </label>

                        {isChecked && expSplitMethod !== "EQUAL" && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              step="any"
                              value={participantSplits[member.id]?.value || ""}
                              onChange={(e) =>
                                setParticipantSplits((prev) => ({
                                  ...prev,
                                  [member.id]: { value: e.target.value }
                                }))
                              }
                              placeholder={
                                expSplitMethod === "UNEQUAL"
                                  ? "$ 0.00"
                                  : expSplitMethod === "PERCENTAGE"
                                  ? "% 0"
                                  : "Shares"
                              }
                              className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-100 text-right text-xs focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-500 font-semibold w-8">
                              {expSplitMethod === "UNEQUAL" ? "USD" : expSplitMethod === "PERCENTAGE" ? "%" : "shares"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-350 font-medium text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseLoading}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {expenseLoading ? "Saving..." : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
