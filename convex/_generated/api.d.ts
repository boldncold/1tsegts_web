/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as http from "../http.js";
import type * as lib_firestoreRest from "../lib/firestoreRest.js";
import type * as lib_orderPricing from "../lib/orderPricing.js";
import type * as menu from "../menu.js";
import type * as migrations_firestoreImport from "../migrations/firestoreImport.js";
import type * as migrations_firestoreMappers from "../migrations/firestoreMappers.js";
import type * as orders from "../orders.js";
import type * as settings from "../settings.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  http: typeof http;
  "lib/firestoreRest": typeof lib_firestoreRest;
  "lib/orderPricing": typeof lib_orderPricing;
  menu: typeof menu;
  "migrations/firestoreImport": typeof migrations_firestoreImport;
  "migrations/firestoreMappers": typeof migrations_firestoreMappers;
  orders: typeof orders;
  settings: typeof settings;
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
