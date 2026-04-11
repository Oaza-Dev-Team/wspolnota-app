// googleSheets.js
// Utility for interacting with Google Sheets API

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

export async function initGoogleAuth(clientId) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) reject(response);
          else resolve(response.access_token);
        },
      }).requestAccessToken();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function fetchMembers(spreadsheetId, accessToken, sheetName = 'Członkowie') {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:H`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Błąd pobierania danych');
  const data = await res.json();
  const rows = data.values || [];
  return rows.map((row, i) => ({
    id: i,
    imie_meza: row[0] || '',
    imie_zony: row[1] || '',
    nazwisko: row[2] || '',
    parafia: row[3] || '',
    numer_kregu: row[4] || '',
    email: row[5] || '',
    telefon: row[6] || '',
    notatki: row[7] || '',
    _rowIndex: i + 2,
  }));
}

export async function addMember(spreadsheetId, accessToken, member, sheetName = 'Członkowie') {
  const values = [[
    member.imie_meza,
    member.imie_zony,
    member.nazwisko,
    member.parafia,
    member.numer_kregu,
    member.email,
    member.telefon,
    member.notatki || '',
  ]];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:H:append?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error('Błąd dodawania członka');
  return res.json();
}

export async function updateMember(spreadsheetId, accessToken, member, sheetName = 'Członkowie') {
  const values = [[
    member.imie_meza,
    member.imie_zony,
    member.nazwisko,
    member.parafia,
    member.numer_kregu,
    member.email,
    member.telefon,
    member.notatki || '',
  ]];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A${member._rowIndex}:H${member._rowIndex}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error('Błąd aktualizacji członka');
  return res.json();
}

export async function deleteMember(spreadsheetId, accessToken, rowIndex, sheetName = 'Członkowie') {
  // Get sheet ID first
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error('Nie znaleziono arkusza');
  const sheetId = sheet.properties.sheetId;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex - 1,
            endIndex: rowIndex,
          },
        },
      }],
    }),
  });
  if (!res.ok) throw new Error('Błąd usuwania członka');
  return res.json();
}
