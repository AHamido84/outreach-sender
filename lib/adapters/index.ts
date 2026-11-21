import { fakeInbox, fakeMailer, fakeMonday } from "../demo/fakes";
import { isDemo } from "../env";
import { realInbox } from "./imap";
import { realMonday } from "./monday";
import { realMailer } from "./smtp";
import type { Inbox, Mailer, MondayApi } from "./types";

export const getMailer = (): Mailer => (isDemo() ? fakeMailer : realMailer);
export const getInbox = (): Inbox => (isDemo() ? fakeInbox : realInbox);
export const getMonday = (): MondayApi => (isDemo() ? fakeMonday : realMonday);
