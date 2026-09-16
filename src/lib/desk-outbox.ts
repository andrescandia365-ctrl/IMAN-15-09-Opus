import { sendDeskTicket } from "@/lib/desk-ticket";
import {
  dropDeskEnvelope,
  pendingDeskEnvelopes,
  queueDeskEnvelope,
  type DeskEnvelope,
} from "@/lib/local-db";
import { isBrowserOnline } from "@/lib/floor-lock";
import type { PayMethod, TicketLine } from "@/lib/types";

export type DeskSendInput = {
  storeId: string;
  lines: TicketLine[];
  payMethod?: PayMethod;
  paid?: number | null;
};

export async function sendOrQueueDeskTicket(input: DeskSendInput): Promise<"sent" | "queued"> {
  if (!isBrowserOnline()) {
    await queueDeskEnvelope(input);
    return "queued";
  }
  try {
    await sendDeskTicket({ data: input });
    return "sent";
  } catch {
    await queueDeskEnvelope(input);
    return "queued";
  }
}

export async function flushDeskOutbox(): Promise<{ sent: number; left: number }> {
  if (!isBrowserOnline()) {
    const left = (await pendingDeskEnvelopes()).length;
    return { sent: 0, left };
  }
  const all = await pendingDeskEnvelopes();
  let sent = 0;
  for (const env of all) {
    try {
      await sendDeskTicket({
        data: {
          storeId: env.storeId,
          lines: env.lines,
          payMethod: env.payMethod,
          paid: env.paid,
        },
      });
      await dropDeskEnvelope(env.id);
      sent += 1;
    } catch {
      break;
    }
  }
  return { sent, left: all.length - sent };
}

export type { DeskEnvelope };
