// 将棋ロジック（チャットベース用）

// 駒の種類
export const PIECES = {
  // 先手（あなた）
  K: "王", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
  // 成り駒
  "+R": "龍", "+B": "馬", "+S": "成銀", "+N": "成桂", "+L": "成香", "+P": "と",
  // 後手（AI）- 小文字
  k: "玉", r: "飛", b: "角", g: "金", s: "銀", n: "桂", l: "香", p: "歩",
  "+r": "龍", "+b": "馬", "+s": "成銀", "+n": "成桂", "+l": "成香", "+p": "と",
} as const;

// 初期盤面（9x9）
// 行: 1-9（上から下）、列: 1-9（右から左、将棋の筋）
export const INITIAL_BOARD = `
l n s g k g s n l
. r . . . . . b .
p p p p p p p p p
. . . . . . . . .
. . . . . . . . .
. . . . . . . . .
P P P P P P P P P
. B . . . . . R .
L N S G K G S N L
`.trim();

export interface GameState {
  board: string[][];       // 9x9 盤面
  turn: "player" | "ai";   // 手番
  playerHand: string[];    // 先手の持ち駒
  aiHand: string[];        // 後手の持ち駒
  moveHistory: string[];   // 棋譜
  gameOver: boolean;
  winner: string | null;
}

// 盤面を文字列から配列に変換
export function parseBoard(boardStr: string): string[][] {
  return boardStr.split("\n").map(row => row.split(" "));
}

// 盤面を表示用テキストに変換
export function boardToText(state: GameState): string {
  const { board, playerHand, aiHand } = state;

  let text = "```\n";
  text += "【AI の持ち駒】" + (aiHand.length > 0 ? aiHand.join(" ") : "なし") + "\n\n";
  text += "  ９ ８ ７ ６ ５ ４ ３ ２ １\n";
  text += "┏━━━━━━━━━━━━━━━━━━━┓\n";

  board.forEach((row, i) => {
    const rowNum = ["一", "二", "三", "四", "五", "六", "七", "八", "九"][i];
    const cells = row.map(cell => {
      if (cell === ".") return "・";
      const piece = PIECES[cell as keyof typeof PIECES] || cell;
      // 後手の駒は v で示す
      if (cell === cell.toLowerCase() && cell !== ".") {
        return `v${piece}`;
      }
      return ` ${piece}`;
    });
    text += `┃${cells.join("")}┃${rowNum}\n`;
  });

  text += "┗━━━━━━━━━━━━━━━━━━━┛\n";
  text += "\n【あなたの持ち駒】" + (playerHand.length > 0 ? playerHand.join(" ") : "なし") + "\n";
  text += "```";

  return text;
}

// 簡易盤面表示（LLM用）
export function boardToSimpleText(state: GameState): string {
  const { board, playerHand, aiHand, turn } = state;

  let text = "現在の盤面:\n";
  text += "AI持駒: " + (aiHand.length > 0 ? aiHand.join(",") : "なし") + "\n";
  text += "  9 8 7 6 5 4 3 2 1\n";

  board.forEach((row, i) => {
    text += `${i + 1} ${row.join(" ")}\n`;
  });

  text += "あなたの持駒: " + (playerHand.length > 0 ? playerHand.join(",") : "なし") + "\n";
  text += `手番: ${turn === "player" ? "あなた" : "AI"}\n`;

  return text;
}

// 初期状態を作成
export function createInitialState(): GameState {
  return {
    board: parseBoard(INITIAL_BOARD),
    turn: "player",
    playerHand: [],
    aiHand: [],
    moveHistory: [],
    gameOver: false,
    winner: null,
  };
}

// 座標を解析（例: "7六" → {col: 6, row: 5}）
export function parsePosition(pos: string): { col: number; row: number } | null {
  // 筋（列）: 1-9 の数字
  // 段（行）: 一〜九 の漢数字
  const colMatch = pos.match(/[１-９1-9]/);
  const rowMatch = pos.match(/[一二三四五六七八九]/);

  if (!colMatch || !rowMatch) return null;

  const colChars = "１２３４５６７８９123456789";
  const rowChars = "一二三四五六七八九";

  let col = colChars.indexOf(colMatch[0]);
  if (col >= 9) col -= 9; // 半角数字の場合
  col = 8 - col; // 将棋の筋は右から左

  const row = rowChars.indexOf(rowMatch[0]);

  return { col, row };
}

// 指し手を解析（例: "7六歩" or "7六歩打"）
export function parseMove(moveStr: string, state: GameState): {
  from: { col: number; row: number } | null;
  to: { col: number; row: number };
  piece: string;
  drop: boolean;
  promote: boolean;
} | null {
  // 打つ場合（持ち駒から）
  const dropMatch = moveStr.match(/([１-９1-9])([一二三四五六七八九])(.+)打/);
  if (dropMatch) {
    const to = parsePosition(dropMatch[1] + dropMatch[2]);
    if (!to) return null;
    return { from: null, to, piece: dropMatch[3], drop: true, promote: false };
  }

  // 移動の場合
  const moveMatch = moveStr.match(/([１-９1-9])([一二三四五六七八九])(.+?)(成)?$/);
  if (moveMatch) {
    const to = parsePosition(moveMatch[1] + moveMatch[2]);
    if (!to) return null;
    const promote = !!moveMatch[4];
    return { from: null, to, piece: moveMatch[3], drop: false, promote };
  }

  return null;
}

// 指し手を適用（簡易版 - 厳密なルールチェックは省略）
export function applyMove(
  state: GameState,
  moveStr: string,
  isAI: boolean = false
): { success: boolean; newState: GameState; message: string } {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;

  // 簡易的な指し手解析
  // 形式: "7六歩", "同歩", "7六歩打", "7六歩成"

  const pieceNames: Record<string, string> = {
    "王": "K", "玉": "k", "飛": isAI ? "r" : "R", "角": isAI ? "b" : "B",
    "金": isAI ? "g" : "G", "銀": isAI ? "s" : "S", "桂": isAI ? "n" : "N",
    "香": isAI ? "l" : "L", "歩": isAI ? "p" : "P",
    "龍": isAI ? "+r" : "+R", "馬": isAI ? "+b" : "+B",
    "と": isAI ? "+p" : "+P", "成銀": isAI ? "+s" : "+S",
    "成桂": isAI ? "+n" : "+N", "成香": isAI ? "+l" : "+L",
  };

  // 打の場合
  if (moveStr.includes("打")) {
    const match = moveStr.match(/([１-９1-9])([一二三四五六七八九])(.+)打/);
    if (!match) return { success: false, newState: state, message: "指し手を理解できませんでした" };

    const to = parsePosition(match[1] + match[2]);
    if (!to) return { success: false, newState: state, message: "位置を理解できませんでした" };

    const pieceName = match[3];
    const piece = pieceNames[pieceName];
    if (!piece) return { success: false, newState: state, message: `駒「${pieceName}」が見つかりません` };

    // 持ち駒から取り除く
    const hand = isAI ? newState.aiHand : newState.playerHand;
    const idx = hand.indexOf(pieceName);
    if (idx === -1) return { success: false, newState: state, message: `持ち駒に「${pieceName}」がありません` };

    hand.splice(idx, 1);
    newState.board[to.row][to.col] = piece;

  } else {
    // 移動の場合
    const match = moveStr.match(/([１-９1-9])([一二三四五六七八九])(.+?)(成)?$/);
    if (!match) return { success: false, newState: state, message: "指し手を理解できませんでした" };

    const to = parsePosition(match[1] + match[2]);
    if (!to) return { success: false, newState: state, message: "位置を理解できませんでした" };

    const pieceName = match[3];
    const promote = !!match[4];
    const piece = pieceNames[pieceName];

    // 移動元を探す（簡易版: 同じ種類の駒で最も近いもの）
    let fromPos: { col: number; row: number } | null = null;
    let foundPiece: string | null = null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = newState.board[r][c];
        if (cell === ".") continue;

        const cellIsAI = cell === cell.toLowerCase();
        if (cellIsAI !== isAI) continue;

        const cellPiece = PIECES[cell as keyof typeof PIECES];
        if (cellPiece === pieceName || cell === piece || cell.replace("+", "") === piece?.replace("+", "")) {
          // 簡易的に最初に見つかった駒を使う
          if (!fromPos) {
            fromPos = { col: c, row: r };
            foundPiece = cell;
          }
        }
      }
    }

    if (!fromPos || !foundPiece) {
      return { success: false, newState: state, message: `動かせる「${pieceName}」が見つかりません` };
    }

    // 移動先に駒があれば取る
    const captured = newState.board[to.row][to.col];
    if (captured !== ".") {
      const capturedPiece = PIECES[captured as keyof typeof PIECES];
      // 成り駒は元に戻す
      const basePiece = captured.replace("+", "").toUpperCase();
      const baseName = PIECES[basePiece as keyof typeof PIECES] || capturedPiece;

      if (isAI) {
        newState.aiHand.push(baseName);
      } else {
        newState.playerHand.push(baseName);
      }
    }

    // 駒を移動
    newState.board[fromPos.row][fromPos.col] = ".";

    // 成る場合
    if (promote && !foundPiece.startsWith("+")) {
      newState.board[to.row][to.col] = "+" + foundPiece;
    } else {
      newState.board[to.row][to.col] = foundPiece;
    }
  }

  // 手番を変更
  newState.turn = isAI ? "player" : "ai";
  newState.moveHistory.push((isAI ? "AI: " : "あなた: ") + moveStr);

  // 王を取ったかチェック
  let playerKing = false;
  let aiKing = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (newState.board[r][c] === "K") playerKing = true;
      if (newState.board[r][c] === "k") aiKing = true;
    }
  }

  if (!playerKing) {
    newState.gameOver = true;
    newState.winner = "AI";
  } else if (!aiKing) {
    newState.gameOver = true;
    newState.winner = "あなた";
  }

  return { success: true, newState, message: "OK" };
}
