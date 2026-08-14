import { NextResponse } from 'next/server';

async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function GET() {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN או MONDAY_BOARD_ID לא מוגדרים' }, { status: 500 });
  }

  const data = await mondayRequest(
    token,
    `query ($boardId: ID!) {
      boards (ids: [$boardId]) {
        name
        columns { id title type }
        groups { id title }
      }
    }`,
    { boardId }
  );

  const board = data?.data?.boards?.[0];

  return NextResponse.json({
    configuredBoardId: boardId,
    boardName: board?.name ?? null,
    groups: board?.groups ?? [],
    columns: board?.columns ?? [],
    rawErrors: data?.errors ?? null,
  });
}
