"use client";

import { useState, useRef, useEffect } from "react";

// 駒の種類と表示名
const PIECE_NAMES: Record<string, string> = {
  K: "王", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
  "+R": "龍", "+B": "馬", "+S": "全", "+N": "圭", "+L": "杏", "+P": "と",
  k: "玉", r: "飛", b: "角", g: "金", s: "銀", n: "桂", l: "香", p: "歩",
  "+r": "龍", "+b": "馬", "+s": "全", "+n": "圭", "+l": "杏", "+p": "と",
};

const KANJI_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

// 初期盤面
const INITIAL_BOARD = [
  ["l", "n", "s", "g", "k", "g", "s", "n", "l"],
  [".", "r", ".", ".", ".", ".", ".", "b", "."],
  ["p", "p", "p", "p", "p", "p", "p", "p", "p"],
  [".", ".", ".", ".", ".", ".", ".", ".", "."],
  [".", ".", ".", ".", ".", ".", ".", ".", "."],
  [".", ".", ".", ".", ".", ".", ".", ".", "."],
  ["P", "P", "P", "P", "P", "P", "P", "P", "P"],
  [".", "B", ".", ".", ".", ".", ".", "R", "."],
  ["L", "N", "S", "G", "K", "G", "S", "N", "L"],
];

interface GameState {
  board: string[][];
  turn: "player" | "ai";
  playerHand: string[];
  aiHand: string[];
  moveHistory: string[];
  gameOver: boolean;
  winner: string | null;
}

interface Message {
  role: "system" | "player" | "ai";
  content: string;
}

function createInitialState(): GameState {
  return {
    board: INITIAL_BOARD.map(row => [...row]),
    turn: "player",
    playerHand: [],
    aiHand: [],
    moveHistory: [],
    gameOver: false,
    winner: null,
  };
}

// 座標を将棋表記に変換
function toNotation(col: number, row: number, pieceName: string, promote: boolean = false): string {
  const colNum = 9 - col; // 右から1-9
  const rowKanji = KANJI_NUMS[row];
  return `${colNum}${rowKanji}${pieceName}${promote ? "成" : ""}`;
}

export default function Home() {
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [selected, setSelected] = useState<{ col: number; row: number } | null>(null);
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "将棋対局開始！あなたは先手（下側）です。駒をクリックして選択し、移動先をクリックしてください。" },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPromote, setShowPromote] = useState<{ col: number; row: number; piece: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isPlayerPiece = (piece: string) => piece !== "." && piece === piece.toUpperCase();
  const isAIPiece = (piece: string) => piece !== "." && piece === piece.toLowerCase();

  const canPromote = (piece: string, fromRow: number, toRow: number): boolean => {
    if (piece.startsWith("+")) return false; // 既に成っている
    const basePiece = piece.toUpperCase();
    if (["K", "G"].includes(basePiece)) return false; // 王と金は成れない
    // 先手: 敵陣は row 0-2
    if (isPlayerPiece(piece)) {
      return toRow <= 2 || fromRow <= 2;
    }
    // 後手: 敵陣は row 6-8
    if (isAIPiece(piece)) {
      return toRow >= 6 || fromRow >= 6;
    }
    return false;
  };

  const executeMove = async (
    toCol: number,
    toRow: number,
    promote: boolean = false
  ) => {
    if (gameState.turn !== "player" || isLoading) return;

    const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
    let movePiece: string;
    let pieceName: string;

    if (selectedHand) {
      // 持ち駒から打つ
      const idx = newState.playerHand.indexOf(selectedHand);
      if (idx === -1) return;
      newState.playerHand.splice(idx, 1);
      movePiece = selectedHand === "飛" ? "R" : selectedHand === "角" ? "B" :
                  selectedHand === "金" ? "G" : selectedHand === "銀" ? "S" :
                  selectedHand === "桂" ? "N" : selectedHand === "香" ? "L" : "P";
      newState.board[toRow][toCol] = movePiece;
      pieceName = selectedHand;
      const notation = toNotation(toCol, toRow, pieceName) + "打";
      newState.moveHistory.push("あなた: " + notation);
      setMessages(prev => [...prev, { role: "player", content: notation }]);
    } else if (selected) {
      // 盤上から移動
      movePiece = newState.board[selected.row][selected.col];
      pieceName = PIECE_NAMES[movePiece] || movePiece;

      // 駒を取る
      const captured = newState.board[toRow][toCol];
      if (captured !== ".") {
        const capturedBase = captured.replace("+", "").toUpperCase();
        const capturedName = PIECE_NAMES[capturedBase] || capturedBase;
        newState.playerHand.push(capturedName);
      }

      newState.board[selected.row][selected.col] = ".";

      // 成り
      if (promote && !movePiece.startsWith("+")) {
        newState.board[toRow][toCol] = "+" + movePiece;
      } else {
        newState.board[toRow][toCol] = movePiece;
      }

      const notation = toNotation(toCol, toRow, pieceName, promote);
      newState.moveHistory.push("あなた: " + notation);
      setMessages(prev => [...prev, { role: "player", content: notation }]);
    } else {
      return;
    }

    newState.turn = "ai";
    setGameState(newState);
    setSelected(null);
    setSelectedHand(null);
    setShowPromote(null);

    // 王を取ったかチェック
    let aiKing = false;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (newState.board[r][c] === "k") aiKing = true;
      }
    }
    if (!aiKing) {
      newState.gameOver = true;
      newState.winner = "あなた";
      setGameState(newState);
      setMessages(prev => [...prev, { role: "system", content: "🎉 おめでとうございます！勝利です！" }]);
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
          board: newState.board,
          playerHand: newState.playerHand,
          aiHand: newState.aiHand,
          moveHistory: newState.moveHistory,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // AIの手を適用
      const aiMove = data.move;
      setMessages(prev => prev.filter(m => m.content !== "AI思考中..."));
      setMessages(prev => [...prev, { role: "ai", content: aiMove }]);

      // 簡易的にAIの手を解析して適用
      const applied = applyAIMove(newState, aiMove);
      if (applied) {
        setGameState(applied);
        // 王を取ったかチェック
        let playerKing = false;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (applied.board[r][c] === "K") playerKing = true;
          }
        }
        if (!playerKing) {
          applied.gameOver = true;
          applied.winner = "AI";
          setGameState(applied);
          setMessages(prev => [...prev, { role: "system", content: "AIの勝利です。" }]);
        }
      } else {
        setMessages(prev => [...prev, { role: "system", content: "（AIの手を認識できませんでした）" }]);
        newState.turn = "player";
        setGameState(newState);
      }
    } catch (error) {
      setMessages(prev => prev.filter(m => m.content !== "AI思考中..."));
      setMessages(prev => [...prev, { role: "system", content: `エラー: ${error instanceof Error ? error.message : "不明"}` }]);
      newState.turn = "player";
      setGameState(newState);
    } finally {
      setIsLoading(false);
    }
  };

  // AIの指し手を盤面に適用
  const applyAIMove = (state: GameState, moveStr: string): GameState | null => {
    const newState = JSON.parse(JSON.stringify(state)) as GameState;

    // 数字と漢数字を抽出
    const colMatch = moveStr.match(/[１-９1-9]/);
    const rowMatch = moveStr.match(/[一二三四五六七八九]/);
    if (!colMatch || !rowMatch) return null;

    const colChars = "１２３４５６７８９123456789";
    let col = colChars.indexOf(colMatch[0]);
    if (col >= 9) col -= 9;
    col = 8 - col;
    const row = KANJI_NUMS.indexOf(rowMatch[0]);

    const isDrop = moveStr.includes("打");
    const isPromote = moveStr.includes("成");

    if (isDrop) {
      // 打ちの場合
      const pieceNames: Record<string, string> = {
        "飛": "r", "角": "b", "金": "g", "銀": "s", "桂": "n", "香": "l", "歩": "p"
      };
      for (const [name, code] of Object.entries(pieceNames)) {
        if (moveStr.includes(name)) {
          const idx = newState.aiHand.indexOf(name);
          if (idx !== -1) {
            newState.aiHand.splice(idx, 1);
            newState.board[row][col] = code;
            break;
          }
        }
      }
    } else {
      // 移動の場合 - 同じ種類の駒を探す
      const pieceNames: Record<string, string[]> = {
        "王": ["k"], "玉": ["k"], "飛": ["r", "+r"], "角": ["b", "+b"],
        "金": ["g"], "銀": ["s", "+s"], "桂": ["n", "+n"], "香": ["l", "+l"], "歩": ["p", "+p"],
        "龍": ["+r"], "馬": ["+b"], "と": ["+p"], "成銀": ["+s"], "全": ["+s"],
        "成桂": ["+n"], "圭": ["+n"], "成香": ["+l"], "杏": ["+l"],
      };

      let foundPiece: string | null = null;
      let fromPos: { col: number; row: number } | null = null;

      for (const [name, codes] of Object.entries(pieceNames)) {
        if (moveStr.includes(name)) {
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              const cell = newState.board[r][c];
              if (codes.includes(cell)) {
                foundPiece = cell;
                fromPos = { col: c, row: r };
                break;
              }
            }
            if (foundPiece) break;
          }
          break;
        }
      }

      if (!foundPiece || !fromPos) return null;

      // 駒を取る
      const captured = newState.board[row][col];
      if (captured !== "." && captured === captured.toUpperCase()) {
        const capturedBase = captured.replace("+", "").toUpperCase();
        const capturedName = PIECE_NAMES[capturedBase] || capturedBase;
        newState.aiHand.push(capturedName);
      }

      newState.board[fromPos.row][fromPos.col] = ".";
      if (isPromote && !foundPiece.startsWith("+")) {
        newState.board[row][col] = "+" + foundPiece;
      } else {
        newState.board[row][col] = foundPiece;
      }
    }

    newState.turn = "player";
    newState.moveHistory.push("AI: " + moveStr);
    return newState;
  };

  const handleCellClick = (col: number, row: number) => {
    if (gameState.turn !== "player" || isLoading || gameState.gameOver) return;

    const piece = gameState.board[row][col];

    // 持ち駒選択中
    if (selectedHand) {
      if (piece === ".") {
        executeMove(col, row);
      } else {
        setSelectedHand(null);
      }
      return;
    }

    // 駒選択中
    if (selected) {
      if (selected.col === col && selected.row === row) {
        setSelected(null);
        return;
      }

      // 自分の駒を選び直し
      if (isPlayerPiece(piece)) {
        setSelected({ col, row });
        return;
      }

      // 移動実行
      const fromPiece = gameState.board[selected.row][selected.col];
      if (canPromote(fromPiece, selected.row, row)) {
        setShowPromote({ col, row, piece: fromPiece });
      } else {
        executeMove(col, row, false);
      }
      return;
    }

    // 新規選択
    if (isPlayerPiece(piece)) {
      setSelected({ col, row });
    }
  };

  const handleHandClick = (pieceName: string) => {
    if (gameState.turn !== "player" || isLoading || gameState.gameOver) return;
    setSelected(null);
    setSelectedHand(selectedHand === pieceName ? null : pieceName);
  };

  const resetGame = () => {
    setGameState(createInitialState());
    setSelected(null);
    setSelectedHand(null);
    setShowPromote(null);
    setMessages([{ role: "system", content: "新しい対局を開始します。" }]);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-screen p-4 max-w-6xl mx-auto">
      {/* 将棋盤 */}
      <div className="flex flex-col items-center">
        <h1 className="text-xl font-bold mb-2">将棋 AI 対局</h1>

        {/* AI持ち駒 */}
        <div className="flex gap-1 mb-2 p-2 bg-gray-800 rounded min-h-10">
          <span className="text-xs text-gray-400 mr-2">AI:</span>
          {gameState.aiHand.map((p, i) => (
            <span key={i} className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center text-sm">
              {p}
            </span>
          ))}
          {gameState.aiHand.length === 0 && <span className="text-gray-500 text-xs">なし</span>}
        </div>

        {/* 盤面 */}
        <div className="relative">
          {/* 列番号 */}
          <div className="flex justify-center mb-1">
            <div className="w-6" />
            {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => (
              <div key={n} className="w-10 h-5 text-center text-xs text-gray-400">{n}</div>
            ))}
          </div>

          {/* 盤面グリッド */}
          <div className="border-2 border-yellow-700 bg-yellow-100">
            {gameState.board.map((row, rowIdx) => (
              <div key={rowIdx} className="flex">
                {row.map((cell, colIdx) => {
                  const isSelected = selected?.col === colIdx && selected?.row === rowIdx;
                  const isAI = isAIPiece(cell);
                  const piece = PIECE_NAMES[cell] || "";

                  return (
                    <div
                      key={colIdx}
                      onClick={() => handleCellClick(colIdx, rowIdx)}
                      className={`w-10 h-10 border border-yellow-700 flex items-center justify-center cursor-pointer transition-colors
                        ${isSelected ? "bg-blue-300" : "hover:bg-yellow-200"}
                        ${cell !== "." ? "font-bold" : ""}
                      `}
                    >
                      {cell !== "." && (
                        <span className={`text-lg ${isAI ? "rotate-180" : ""} ${isAI ? "text-red-800" : "text-gray-900"}`}>
                          {piece}
                        </span>
                      )}
                    </div>
                  );
                })}
                {/* 行番号 */}
                <div className="w-6 h-10 flex items-center justify-center text-xs text-gray-400">
                  {KANJI_NUMS[rowIdx]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* プレイヤー持ち駒 */}
        <div className="flex gap-1 mt-2 p-2 bg-gray-800 rounded min-h-10">
          <span className="text-xs text-gray-400 mr-2">あなた:</span>
          {gameState.playerHand.map((p, i) => (
            <button
              key={i}
              onClick={() => handleHandClick(p)}
              className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors
                ${selectedHand === p ? "bg-blue-500" : "bg-gray-700 hover:bg-gray-600"}
              `}
            >
              {p}
            </button>
          ))}
          {gameState.playerHand.length === 0 && <span className="text-gray-500 text-xs">なし</span>}
        </div>

        {/* 操作ボタン */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500"
          >
            リセット
          </button>
        </div>

        {/* ステータス */}
        <div className="mt-2 text-sm text-gray-400">
          手番: {gameState.turn === "player" ? "あなた" : "AI"} |
          {gameState.moveHistory.length}手 |
          {isLoading && " 思考中..."}
          {gameState.gameOver && ` 勝者: ${gameState.winner}`}
        </div>

        {/* 成り確認ダイアログ */}
        {showPromote && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="mb-4">成りますか？</p>
              <div className="flex gap-2">
                <button
                  onClick={() => executeMove(showPromote.col, showPromote.row, true)}
                  className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
                >
                  成る
                </button>
                <button
                  onClick={() => executeMove(showPromote.col, showPromote.row, false)}
                  className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500"
                >
                  成らない
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* チャットログ */}
      <div className="flex-1 flex flex-col min-w-[300px]">
        <h2 className="text-lg font-bold mb-2">棋譜・ログ</h2>
        <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg p-3 space-y-2 max-h-[500px]">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-2 rounded text-sm ${
                msg.role === "player"
                  ? "bg-blue-600 ml-auto max-w-fit"
                  : msg.role === "ai"
                  ? "bg-red-600 mr-auto max-w-fit"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              {msg.role !== "system" && (
                <span className="text-xs text-gray-300 mr-2">
                  {msg.role === "player" ? "▲" : "△"}
                </span>
              )}
              {msg.content}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
