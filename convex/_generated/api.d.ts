/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bank from "../bank.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_firestoreRest from "../lib/firestoreRest.js";
import type * as lib_orderPricing from "../lib/orderPricing.js";
import type * as lib_qpayClient from "../lib/qpayClient.js";
import type * as menu from "../menu.js";
import type * as menuAdmin from "../menuAdmin.js";
import type * as migrations_firestoreImport from "../migrations/firestoreImport.js";
import type * as migrations_firestoreMappers from "../migrations/firestoreMappers.js";
import type * as orders from "../orders.js";
import type * as ordersAdmin from "../ordersAdmin.js";
import type * as payments from "../payments.js";
import type * as qpay from "../qpay.js";
import type * as settings from "../settings.js";
import type * as staff from "../staff.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bank: typeof bank;
  crons: typeof crons;
  http: typeof http;
  "lib/admin": typeof lib_admin;
  "lib/availability": typeof lib_availability;
  "lib/firestoreRest": typeof lib_firestoreRest;
  "lib/orderPricing": typeof lib_orderPricing;
  "lib/qpayClient": typeof lib_qpayClient;
  menu: typeof menu;
  menuAdmin: typeof menuAdmin;
  "migrations/firestoreImport": typeof migrations_firestoreImport;
  "migrations/firestoreMappers": typeof migrations_firestoreMappers;
  orders: typeof orders;
  ordersAdmin: typeof ordersAdmin;
  payments: typeof payments;
  qpay: typeof qpay;
  settings: typeof settings;
  staff: typeof staff;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
