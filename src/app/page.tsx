"use client";

import { useState, useRef, useEffect } from "react";
import { GameState, createInitialState, boardToText, applyMove } from "@/lib/shogi";

interface Message {
  role: "system" | "player" | "ai";
  content: string;
}

export default function Home() {
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "将棋対局を開始します。あなたは先手（下側）です。\n指し手は「7六歩」のように入力してください。\n「打」は持ち駒から打つとき、「成」は成るときに使います。" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 初期盤面を表示
    setMessages(prev => [...prev, { role: "system", content: boardToText(gameState) }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || gameState.gameOver) return;

    const playerMove = input.trim();
    setInput("");

    // プレイヤーの指し手をメッセージに追加
    setMessages(prev => [...prev, { role: "player", content: playerMove }]);

    // 指し手を適用
    const result = applyMove(gameState, playerMove, false);

    if (!result.success) {
      setMessages(prev => [...prev, {
        role: "system",
        content: `エラー: ${result.message}\n指し手の例: 7六歩, 2四歩, 7七角成, 5五歩打`
      }]);
      return;
    }

    setGameState(result.newState);
    setMessages(prev => [...prev, { role: "system", content: boardToText(result.newState) }]);

    if (result.newState.gameOver) {
      setMessages(prev => [...prev, {
        role: "system",
        content: `ゲーム終了！ 勝者: ${result.newState.winner}`
      }]);
      return;
    }

    // AIの手番
    setIsLoading(true);
    setMessages(prev => [...prev, { role: "system", content: "AI思考中..." }]);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: result.newState.board,
          playerHand: result.newState.playerHand,
          aiHand: result.newState.aiHand,
          moveHistory: result.newState.moveHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      // AIの指し手を適用
      const aiResult = applyMove(result.newState, data.move, true);

      // 思考中メッセージを削除
      setMessages(prev => prev.filter(m => m.content !== "AI思考中..."));

      if (!aiResult.success) {
        // AIが無効な手を指した場合、ランダムな手を試す
        setMessages(prev => [...prev, {
          role: "ai",
          content: `${data.move} (${data.rawResponse})\n[無効な手のため、パスします]`
        }]);
        // 手番を戻す
        const resetState = { ...result.newState, turn: "player" as const };
        setGameState(resetState);
      } else {
        setMessages(prev => [...prev, { role: "ai", content: data.move }]);
        setGameState(aiResult.newState);
        setMessages(prev => [...prev, { role: "system", content: boardToText(aiResult.newState) }]);

        if (aiResult.newState.gameOver) {
          setMessages(prev => [...prev, {
            role: "system",
            content: `ゲーム終了！ 勝者: ${aiResult.newState.winner}`
          }]);
        }
      }
    } catch (error) {
      setMessages(prev => prev.filter(m => m.content !== "AI思考中..."));
      setMessages(prev => [...prev, {
        role: "system",
        content: `AIエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      }]);
      // 手番を戻す
      const resetState = { ...result.newState, turn: "player" as const };
      setGameState(resetState);
    } finally {
      setIsLoading(false);
    }
  };

  const resetGame = () => {
    const newState = createInitialState();
    setGameState(newState);
    setMessages([
      { role: "system", content: "新しい対局を開始します。あなたは先手（下側）です。" },
      { role: "system", content: boardToText(newState) },
    ]);
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <header className="text-center mb-4">
        <h1 className="text-2xl font-bold">将棋チャット AI 対局</h1>
        <p className="text-gray-400 text-sm">チャットで将棋を指す - OpenRouter AI</p>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg p-4 mb-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              msg.role === "player"
                ? "bg-blue-600 ml-auto max-w-xs"
                : msg.role === "ai"
                ? "bg-red-600 mr-auto max-w-xs"
                : "bg-gray-700 text-sm"
            }`}
          >
            {msg.role !== "system" && (
              <div className="text-xs text-gray-300 mb-1">
                {msg.role === "player" ? "あなた" : "AI"}
              </div>
            )}
            <pre className="whitespace-pre-wrap font-mono text-sm">{msg.content}</pre>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="指し手を入力... (例: 7六歩)"
            className="flex-1 p-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading || gameState.gameOver}
          />
          <button
            type="submit"
            disabled={isLoading || gameState.gameOver}
            className="px-6 py-3 bg-blue-600 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "..." : "指す"}
          </button>
        </form>
        <button
          onClick={resetGame}
          className="px-4 py-3 bg-gray-600 rounded-lg hover:bg-gray-500"
        >
          リセット
        </button>
      </div>

      <div className="mt-2 text-center text-gray-500 text-xs">
        棋譜: {gameState.moveHistory.length}手 |
        手番: {gameState.turn === "player" ? "あなた" : "AI"} |
        {gameState.gameOver && ` 勝者: ${gameState.winner}`}
      </div>
    </div>
  );
}
