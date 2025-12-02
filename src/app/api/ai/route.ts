import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { board, playerHand, aiHand, moveHistory } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // 盤面を文字列に変換
    let boardText = "現在の将棋盤面:\n";
    boardText += "  9 8 7 6 5 4 3 2 1\n";
    board.forEach((row: string[], i: number) => {
      boardText += `${i + 1} ${row.join(" ")}\n`;
    });
    boardText += `\nあなた(後手)の持駒: ${aiHand.length > 0 ? aiHand.join(", ") : "なし"}`;
    boardText += `\n相手(先手)の持駒: ${playerHand.length > 0 ? playerHand.join(", ") : "なし"}`;

    if (moveHistory.length > 0) {
      boardText += `\n\n直近の棋譜:\n${moveHistory.slice(-5).join("\n")}`;
    }

    const systemPrompt = `あなたは将棋AIです。後手（小文字の駒）を担当しています。
盤面表記:
- 大文字(K,R,B,G,S,N,L,P)は先手（相手）の駒
- 小文字(k,r,b,g,s,n,l,p)はあなた（後手）の駒
- "."は空きマス
- +は成り駒
- 列は右から1-9、行は上から1-9

駒の略称:
K/k=王/玉, R/r=飛, B/b=角, G/g=金, S/s=銀, N/n=桂, L/l=香, P/p=歩
+R/+r=龍, +B/+b=馬

あなたの指し手を「7六歩」のような形式で1手だけ返答してください。
成る場合は「3三角成」、打つ場合は「5五歩打」と書いてください。
必ず合法手を指してください。簡潔に1手だけ回答してください。`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://shogi-chat.vercel.app",
        "X-Title": "Shogi Chat AI",
      },
      body: JSON.stringify({
        model: "x-ai/grok-4.1-fast:free", // 無料モデル
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: boardText + "\n\nあなたの番です。次の一手を指してください。" }
        ],
        max_tokens: 100,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", errorText);
      return NextResponse.json({ error: "AI request failed", details: errorText }, { status: 500 });
    }

    const data = await response.json();
    const aiMove = data.choices?.[0]?.message?.content?.trim() || "";

    // 指し手を抽出（最初の「N段駒」形式を探す）
    const moveMatch = aiMove.match(/[１-９1-9][一二三四五六七八九][王玉飛角金銀桂香歩龍馬と成][成打]?/);
    const extractedMove = moveMatch ? moveMatch[0] : aiMove.slice(0, 10);

    return NextResponse.json({
      move: extractedMove,
      rawResponse: aiMove,
      model: "x-ai/grok-4.1-fast:free"
    });

  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
