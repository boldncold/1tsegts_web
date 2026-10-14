import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Close QPay orders whose payment window has passed (convex/qpay.ts).
crons.interval("expire pending QPay invoices", { minutes: 5 }, internal.qpay.expirePendingInvoices, {});

export default crons;
