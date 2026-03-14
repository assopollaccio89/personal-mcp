import { google } from "googleapis";

export class GoogleClient {
  private auth: any;

  constructor(auth: any) {
    this.auth = auth;
  }

  // --- Calendar ---

  async listUpcomingEvents(maxResults: number = 10) {
    const calendar = google.calendar({ version: "v3", auth: this.auth });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });
    return res.data.items || [];
  }

  // --- Gmail ---

  async listUnreadEmails(maxResults: number = 5) {
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults,
    });

    const messages = res.data.messages || [];
    const details = await Promise.all(
      messages.map(async (msg) => {
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
        });
        const headers = fullMsg.data.payload?.headers;
        return {
          id: msg.id,
          threadId: msg.threadId,
          snippet: fullMsg.data.snippet,
          from: headers?.find((h) => h.name === "From")?.value,
          subject: headers?.find((h) => h.name === "Subject")?.value,
          date: headers?.find((h) => h.name === "Date")?.value,
        };
      })
    );

    return details;
  }

  async searchEmails(query: string, maxResults: number = 5) {
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });

    const messages = res.data.messages || [];
    return await Promise.all(
      messages.map(async (msg) => {
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
        });
        return {
          id: msg.id,
          snippet: fullMsg.data.snippet,
          subject: fullMsg.data.payload?.headers?.find((h) => h.name === "Subject")?.value,
        };
      })
    );
  }
}
