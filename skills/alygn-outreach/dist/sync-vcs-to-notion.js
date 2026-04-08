// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// ../../node_modules/@notionhq/client/build/src/utils.js
var require_utils = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.assertNever = assertNever;
  exports.pick = pick;
  exports.isObject = isObject;
  exports.getUnknownParams = getUnknownParams;
  function assertNever(value) {
    throw new Error(`Unexpected value should never occur: ${value}`);
  }
  function pick(base, keys) {
    const entries = keys.map((key) => [key, base === null || base === undefined ? undefined : base[key]]);
    return Object.fromEntries(entries);
  }
  function isObject(o) {
    return typeof o === "object" && o !== null;
  }
  function getUnknownParams(args, endpoint) {
    var _a;
    const knownKeys = new Set([
      ...endpoint.pathParams,
      ...endpoint.queryParams,
      ...endpoint.bodyParams,
      ...(_a = endpoint.formDataParams) !== null && _a !== undefined ? _a : [],
      "auth"
    ]);
    return Object.keys(args).filter((k) => !knownKeys.has(k));
  }
});

// ../../node_modules/@notionhq/client/build/src/logging.js
var require_logging = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.LogLevel = undefined;
  exports.makeConsoleLogger = makeConsoleLogger;
  exports.logLevelSeverity = logLevelSeverity;
  var utils_1 = require_utils();
  var LogLevel;
  (function(LogLevel2) {
    LogLevel2["DEBUG"] = "debug";
    LogLevel2["INFO"] = "info";
    LogLevel2["WARN"] = "warn";
    LogLevel2["ERROR"] = "error";
  })(LogLevel || (exports.LogLevel = LogLevel = {}));
  function makeConsoleLogger(name) {
    return (level, message, extraInfo) => {
      console[level](`${name} ${level}:`, message, extraInfo);
    };
  }
  function logLevelSeverity(level) {
    switch (level) {
      case LogLevel.DEBUG:
        return 20;
      case LogLevel.INFO:
        return 40;
      case LogLevel.WARN:
        return 60;
      case LogLevel.ERROR:
        return 80;
      default:
        return (0, utils_1.assertNever)(level);
    }
  }
});

// ../../node_modules/@notionhq/client/build/src/errors.js
var require_errors = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.APIResponseError = exports.UnknownHTTPResponseError = exports.InvalidPathParameterError = exports.RequestTimeoutError = exports.ClientErrorCode = exports.APIErrorCode = undefined;
  exports.isNotionClientError = isNotionClientError;
  exports.validateRequestPath = validateRequestPath;
  exports.isHTTPResponseError = isHTTPResponseError;
  exports.buildRequestError = buildRequestError;
  var utils_1 = require_utils();
  var APIErrorCode;
  (function(APIErrorCode2) {
    APIErrorCode2["Unauthorized"] = "unauthorized";
    APIErrorCode2["RestrictedResource"] = "restricted_resource";
    APIErrorCode2["ObjectNotFound"] = "object_not_found";
    APIErrorCode2["RateLimited"] = "rate_limited";
    APIErrorCode2["InvalidJSON"] = "invalid_json";
    APIErrorCode2["InvalidRequestURL"] = "invalid_request_url";
    APIErrorCode2["InvalidRequest"] = "invalid_request";
    APIErrorCode2["ValidationError"] = "validation_error";
    APIErrorCode2["ConflictError"] = "conflict_error";
    APIErrorCode2["InternalServerError"] = "internal_server_error";
    APIErrorCode2["ServiceUnavailable"] = "service_unavailable";
  })(APIErrorCode || (exports.APIErrorCode = APIErrorCode = {}));
  var ClientErrorCode;
  (function(ClientErrorCode2) {
    ClientErrorCode2["RequestTimeout"] = "notionhq_client_request_timeout";
    ClientErrorCode2["ResponseError"] = "notionhq_client_response_error";
    ClientErrorCode2["InvalidPathParameter"] = "notionhq_client_invalid_path_parameter";
  })(ClientErrorCode || (exports.ClientErrorCode = ClientErrorCode = {}));

  class NotionClientErrorBase extends Error {
  }
  function isNotionClientError(error) {
    return (0, utils_1.isObject)(error) && error instanceof NotionClientErrorBase;
  }
  function isNotionClientErrorWithCode(error, codes) {
    return isNotionClientError(error) && error.code in codes;
  }

  class RequestTimeoutError extends NotionClientErrorBase {
    constructor(message = "Request to Notion API has timed out") {
      super(message);
      this.code = ClientErrorCode.RequestTimeout;
      this.name = "RequestTimeoutError";
    }
    static isRequestTimeoutError(error) {
      return isNotionClientErrorWithCode(error, {
        [ClientErrorCode.RequestTimeout]: true
      });
    }
    static rejectAfterTimeout(promise, timeoutMS) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new RequestTimeoutError);
        }, timeoutMS);
        promise.then(resolve).catch(reject).then(() => clearTimeout(timeoutId));
      });
    }
  }
  exports.RequestTimeoutError = RequestTimeoutError;

  class InvalidPathParameterError extends NotionClientErrorBase {
    constructor(message = "Path parameter contains invalid characters that could alter the request path") {
      super(message);
      this.code = ClientErrorCode.InvalidPathParameter;
      this.name = "InvalidPathParameterError";
    }
    static isInvalidPathParameterError(error) {
      return isNotionClientErrorWithCode(error, {
        [ClientErrorCode.InvalidPathParameter]: true
      });
    }
  }
  exports.InvalidPathParameterError = InvalidPathParameterError;
  function validateRequestPath(path) {
    if (path.includes("..")) {
      throw new InvalidPathParameterError(`Request path "${path}" contains path traversal sequence ".."`);
    }
    if (/%2e/i.test(path)) {
      let decoded;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return;
      }
      if (decoded.includes("..")) {
        throw new InvalidPathParameterError(`Request path "${path}" contains encoded path traversal sequence`);
      }
    }
  }

  class HTTPResponseError extends NotionClientErrorBase {
    constructor(args) {
      super(args.message);
      this.name = "HTTPResponseError";
      const { code, status, headers, rawBodyText, additional_data, request_id } = args;
      this.code = code;
      this.status = status;
      this.headers = headers;
      this.body = rawBodyText;
      this.additional_data = additional_data;
      this.request_id = request_id;
    }
  }
  var httpResponseErrorCodes = {
    [ClientErrorCode.ResponseError]: true,
    [APIErrorCode.Unauthorized]: true,
    [APIErrorCode.RestrictedResource]: true,
    [APIErrorCode.ObjectNotFound]: true,
    [APIErrorCode.RateLimited]: true,
    [APIErrorCode.InvalidJSON]: true,
    [APIErrorCode.InvalidRequestURL]: true,
    [APIErrorCode.InvalidRequest]: true,
    [APIErrorCode.ValidationError]: true,
    [APIErrorCode.ConflictError]: true,
    [APIErrorCode.InternalServerError]: true,
    [APIErrorCode.ServiceUnavailable]: true
  };
  function isHTTPResponseError(error) {
    if (!isNotionClientErrorWithCode(error, httpResponseErrorCodes)) {
      return false;
    }
    return true;
  }

  class UnknownHTTPResponseError extends HTTPResponseError {
    constructor(args) {
      var _a;
      super({
        ...args,
        code: ClientErrorCode.ResponseError,
        message: (_a = args.message) !== null && _a !== undefined ? _a : `Request to Notion API failed with status: ${args.status}`,
        additional_data: undefined,
        request_id: undefined
      });
      this.name = "UnknownHTTPResponseError";
    }
    static isUnknownHTTPResponseError(error) {
      return isNotionClientErrorWithCode(error, {
        [ClientErrorCode.ResponseError]: true
      });
    }
  }
  exports.UnknownHTTPResponseError = UnknownHTTPResponseError;
  var apiErrorCodes = {
    [APIErrorCode.Unauthorized]: true,
    [APIErrorCode.RestrictedResource]: true,
    [APIErrorCode.ObjectNotFound]: true,
    [APIErrorCode.RateLimited]: true,
    [APIErrorCode.InvalidJSON]: true,
    [APIErrorCode.InvalidRequestURL]: true,
    [APIErrorCode.InvalidRequest]: true,
    [APIErrorCode.ValidationError]: true,
    [APIErrorCode.ConflictError]: true,
    [APIErrorCode.InternalServerError]: true,
    [APIErrorCode.ServiceUnavailable]: true
  };

  class APIResponseError extends HTTPResponseError {
    constructor() {
      super(...arguments);
      this.name = "APIResponseError";
    }
    static isAPIResponseError(error) {
      return isNotionClientErrorWithCode(error, apiErrorCodes);
    }
  }
  exports.APIResponseError = APIResponseError;
  function buildRequestError(response, bodyText) {
    const apiErrorResponseBody = parseAPIErrorResponseBody(bodyText);
    if (apiErrorResponseBody !== undefined) {
      return new APIResponseError({
        code: apiErrorResponseBody.code,
        message: apiErrorResponseBody.message,
        headers: response.headers,
        status: response.status,
        rawBodyText: bodyText,
        additional_data: apiErrorResponseBody.additional_data,
        request_id: apiErrorResponseBody.request_id
      });
    }
    return new UnknownHTTPResponseError({
      message: undefined,
      headers: response.headers,
      status: response.status,
      rawBodyText: bodyText
    });
  }
  function parseAPIErrorResponseBody(body) {
    if (typeof body !== "string") {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (parseError) {
      return;
    }
    if (!(0, utils_1.isObject)(parsed) || typeof parsed["message"] !== "string" || !isAPIErrorCode(parsed["code"])) {
      return;
    }
    const additional_data = parsed["additional_data"];
    const request_id = parsed["request_id"];
    return {
      ...parsed,
      code: parsed["code"],
      message: parsed["message"],
      additional_data,
      request_id
    };
  }
  function isAPIErrorCode(code) {
    return typeof code === "string" && code in apiErrorCodes;
  }
});

// ../../node_modules/@notionhq/client/build/src/api-endpoints.js
var require_api_endpoints = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.oauthIntrospect = exports.oauthRevoke = exports.oauthToken = exports.getFileUpload = exports.completeFileUpload = exports.sendFileUpload = exports.listFileUploads = exports.createFileUpload = exports.getComment = exports.listComments = exports.createComment = exports.search = exports.createDatabase = exports.updateDatabase = exports.getDatabase = exports.listDataSourceTemplates = exports.createDataSource = exports.queryDataSource = exports.updateDataSource = exports.getDataSource = exports.appendBlockChildren = exports.listBlockChildren = exports.deleteBlock = exports.updateBlock = exports.getBlock = exports.updatePageMarkdown = exports.getPageMarkdown = exports.getPageProperty = exports.movePage = exports.updatePage = exports.getPage = exports.createPage = exports.listUsers = exports.getUser = exports.getSelf = undefined;
  exports.getSelf = {
    method: "get",
    pathParams: [],
    queryParams: [],
    bodyParams: [],
    path: () => `users/me`
  };
  exports.getUser = {
    method: "get",
    pathParams: ["user_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `users/${p.user_id}`
  };
  exports.listUsers = {
    method: "get",
    pathParams: [],
    queryParams: ["start_cursor", "page_size"],
    bodyParams: [],
    path: () => `users`
  };
  exports.createPage = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: [
      "parent",
      "properties",
      "icon",
      "cover",
      "content",
      "children",
      "markdown",
      "template",
      "position"
    ],
    path: () => `pages`
  };
  exports.getPage = {
    method: "get",
    pathParams: ["page_id"],
    queryParams: ["filter_properties"],
    bodyParams: [],
    path: (p) => `pages/${p.page_id}`
  };
  exports.updatePage = {
    method: "patch",
    pathParams: ["page_id"],
    queryParams: [],
    bodyParams: [
      "archived",
      "properties",
      "icon",
      "cover",
      "is_locked",
      "template",
      "erase_content",
      "in_trash"
    ],
    path: (p) => `pages/${p.page_id}`
  };
  exports.movePage = {
    method: "post",
    pathParams: ["page_id"],
    queryParams: [],
    bodyParams: ["parent"],
    path: (p) => `pages/${p.page_id}/move`
  };
  exports.getPageProperty = {
    method: "get",
    pathParams: ["page_id", "property_id"],
    queryParams: ["start_cursor", "page_size"],
    bodyParams: [],
    path: (p) => `pages/${p.page_id}/properties/${p.property_id}`
  };
  exports.getPageMarkdown = {
    method: "get",
    pathParams: ["page_id"],
    queryParams: ["include_transcript"],
    bodyParams: [],
    path: (p) => `pages/${p.page_id}/markdown`
  };
  exports.updatePageMarkdown = {
    method: "patch",
    pathParams: ["page_id"],
    queryParams: [],
    bodyParams: ["type", "insert_content", "replace_content_range"],
    path: (p) => `pages/${p.page_id}/markdown`
  };
  exports.getBlock = {
    method: "get",
    pathParams: ["block_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `blocks/${p.block_id}`
  };
  exports.updateBlock = {
    method: "patch",
    pathParams: ["block_id"],
    queryParams: [],
    bodyParams: [
      "archived",
      "embed",
      "type",
      "in_trash",
      "bookmark",
      "image",
      "video",
      "pdf",
      "file",
      "audio",
      "code",
      "equation",
      "divider",
      "breadcrumb",
      "table_of_contents",
      "link_to_page",
      "table_row",
      "heading_1",
      "heading_2",
      "heading_3",
      "paragraph",
      "bulleted_list_item",
      "numbered_list_item",
      "quote",
      "to_do",
      "toggle",
      "template",
      "callout",
      "synced_block",
      "table",
      "column"
    ],
    path: (p) => `blocks/${p.block_id}`
  };
  exports.deleteBlock = {
    method: "delete",
    pathParams: ["block_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `blocks/${p.block_id}`
  };
  exports.listBlockChildren = {
    method: "get",
    pathParams: ["block_id"],
    queryParams: ["start_cursor", "page_size"],
    bodyParams: [],
    path: (p) => `blocks/${p.block_id}/children`
  };
  exports.appendBlockChildren = {
    method: "patch",
    pathParams: ["block_id"],
    queryParams: [],
    bodyParams: ["after", "children", "position"],
    path: (p) => `blocks/${p.block_id}/children`
  };
  exports.getDataSource = {
    method: "get",
    pathParams: ["data_source_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `data_sources/${p.data_source_id}`
  };
  exports.updateDataSource = {
    method: "patch",
    pathParams: ["data_source_id"],
    queryParams: [],
    bodyParams: ["archived", "title", "icon", "properties", "in_trash", "parent"],
    path: (p) => `data_sources/${p.data_source_id}`
  };
  exports.queryDataSource = {
    method: "post",
    pathParams: ["data_source_id"],
    queryParams: ["filter_properties"],
    bodyParams: [
      "archived",
      "sorts",
      "filter",
      "start_cursor",
      "page_size",
      "in_trash",
      "result_type"
    ],
    path: (p) => `data_sources/${p.data_source_id}/query`
  };
  exports.createDataSource = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: ["parent", "properties", "title", "icon"],
    path: () => `data_sources`
  };
  exports.listDataSourceTemplates = {
    method: "get",
    pathParams: ["data_source_id"],
    queryParams: ["name", "start_cursor", "page_size"],
    bodyParams: [],
    path: (p) => `data_sources/${p.data_source_id}/templates`
  };
  exports.getDatabase = {
    method: "get",
    pathParams: ["database_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `databases/${p.database_id}`
  };
  exports.updateDatabase = {
    method: "patch",
    pathParams: ["database_id"],
    queryParams: [],
    bodyParams: [
      "parent",
      "title",
      "description",
      "is_inline",
      "icon",
      "cover",
      "in_trash",
      "is_locked"
    ],
    path: (p) => `databases/${p.database_id}`
  };
  exports.createDatabase = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: [
      "parent",
      "title",
      "description",
      "is_inline",
      "initial_data_source",
      "icon",
      "cover"
    ],
    path: () => `databases`
  };
  exports.search = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: ["sort", "query", "start_cursor", "page_size", "filter"],
    path: () => `search`
  };
  exports.createComment = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: [
      "rich_text",
      "attachments",
      "display_name",
      "parent",
      "discussion_id"
    ],
    path: () => `comments`
  };
  exports.listComments = {
    method: "get",
    pathParams: [],
    queryParams: ["block_id", "start_cursor", "page_size"],
    bodyParams: [],
    path: () => `comments`
  };
  exports.getComment = {
    method: "get",
    pathParams: ["comment_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `comments/${p.comment_id}`
  };
  exports.createFileUpload = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: [
      "mode",
      "filename",
      "content_type",
      "number_of_parts",
      "external_url"
    ],
    path: () => `file_uploads`
  };
  exports.listFileUploads = {
    method: "get",
    pathParams: [],
    queryParams: ["status", "start_cursor", "page_size"],
    bodyParams: [],
    path: () => `file_uploads`
  };
  exports.sendFileUpload = {
    method: "post",
    pathParams: ["file_upload_id"],
    queryParams: [],
    bodyParams: [],
    formDataParams: ["file", "part_number"],
    path: (p) => `file_uploads/${p.file_upload_id}/send`
  };
  exports.completeFileUpload = {
    method: "post",
    pathParams: ["file_upload_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `file_uploads/${p.file_upload_id}/complete`
  };
  exports.getFileUpload = {
    method: "get",
    pathParams: ["file_upload_id"],
    queryParams: [],
    bodyParams: [],
    path: (p) => `file_uploads/${p.file_upload_id}`
  };
  exports.oauthToken = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: [
      "grant_type",
      "code",
      "redirect_uri",
      "external_account",
      "refresh_token"
    ],
    path: () => `oauth/token`
  };
  exports.oauthRevoke = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: ["token"],
    path: () => `oauth/revoke`
  };
  exports.oauthIntrospect = {
    method: "post",
    pathParams: [],
    queryParams: [],
    bodyParams: ["token"],
    path: () => `oauth/introspect`
  };
});

// ../../node_modules/@notionhq/client/build/package.json
var require_package = __commonJS((exports, module) => {
  module.exports = {
    name: "@notionhq/client",
    version: "5.12.0",
    description: "A simple and easy to use client for the Notion API",
    engines: {
      node: ">=18"
    },
    homepage: "https://developers.notion.com/docs/getting-started",
    bugs: {
      url: "https://github.com/makenotion/notion-sdk-js/issues"
    },
    repository: {
      type: "git",
      url: "https://github.com/makenotion/notion-sdk-js/"
    },
    keywords: [
      "notion",
      "notionapi",
      "rest",
      "notion-api"
    ],
    main: "./build/src",
    types: "./build/src/index.d.ts",
    scripts: {
      prepare: "husky && npm run build",
      prepublishOnly: "npm run checkLoggedIn && npm run lint && npm run test",
      build: "tsc",
      prettier: "prettier --write .",
      lint: "prettier --check . && eslint . --ext .ts && cspell '**/*' ",
      test: "jest ./test",
      "check-links": "git ls-files | grep md$ | xargs -n 1 markdown-link-check",
      prebuild: "npm run clean",
      clean: "rm -rf ./build",
      checkLoggedIn: "./scripts/verifyLoggedIn.sh"
    },
    "lint-staged": {
      "*.{ts,js,json,md}": "prettier --write",
      "*.ts": "eslint --fix"
    },
    author: "",
    license: "MIT",
    files: [
      "build/package.json",
      "build/src/**"
    ],
    devDependencies: {
      "@types/jest": "29.5.14",
      "@typescript-eslint/eslint-plugin": "7.18.0",
      "@typescript-eslint/parser": "7.18.0",
      cspell: "8.17.1",
      eslint: "8.57.1",
      husky: "^9.1.7",
      jest: "29.7.0",
      "lint-staged": "^16.2.6",
      "markdown-link-check": "3.13.7",
      prettier: "3.3.3",
      "ts-jest": "29.2.5",
      typescript: "5.9.2"
    }
  };
});

// ../../node_modules/@notionhq/client/build/src/Client.js
var require_Client = __commonJS((exports) => {
  var __classPrivateFieldSet = exports && exports.__classPrivateFieldSet || function(receiver, state, value, kind, f) {
    if (kind === "m")
      throw new TypeError("Private method is not writable");
    if (kind === "a" && !f)
      throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  };
  var __classPrivateFieldGet = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
    if (kind === "a" && !f)
      throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
  var _Client_auth;
  var _Client_logLevel;
  var _Client_logger;
  var _Client_prefixUrl;
  var _Client_timeoutMs;
  var _Client_notionVersion;
  var _Client_fetch;
  var _Client_agent;
  var _Client_userAgent;
  var _Client_maxRetries;
  var _Client_initialRetryDelayMs;
  var _Client_maxRetryDelayMs;
  Object.defineProperty(exports, "__esModule", { value: true });
  var logging_1 = require_logging();
  var errors_1 = require_errors();
  var utils_1 = require_utils();
  var api_endpoints_1 = require_api_endpoints();
  var package_json_1 = require_package();

  class Client {
    constructor(options) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
      _Client_auth.set(this, undefined);
      _Client_logLevel.set(this, undefined);
      _Client_logger.set(this, undefined);
      _Client_prefixUrl.set(this, undefined);
      _Client_timeoutMs.set(this, undefined);
      _Client_notionVersion.set(this, undefined);
      _Client_fetch.set(this, undefined);
      _Client_agent.set(this, undefined);
      _Client_userAgent.set(this, undefined);
      _Client_maxRetries.set(this, undefined);
      _Client_initialRetryDelayMs.set(this, undefined);
      _Client_maxRetryDelayMs.set(this, undefined);
      this.blocks = {
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getBlock);
          return this.request({
            path: api_endpoints_1.getBlock.path(args),
            method: api_endpoints_1.getBlock.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getBlock.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getBlock.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        update: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.updateBlock);
          return this.request({
            path: api_endpoints_1.updateBlock.path(args),
            method: api_endpoints_1.updateBlock.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.updateBlock.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.updateBlock.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        delete: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.deleteBlock);
          return this.request({
            path: api_endpoints_1.deleteBlock.path(args),
            method: api_endpoints_1.deleteBlock.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.deleteBlock.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.deleteBlock.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        children: {
          append: (args) => {
            this.warnUnknownParams(args, api_endpoints_1.appendBlockChildren);
            return this.request({
              path: api_endpoints_1.appendBlockChildren.path(args),
              method: api_endpoints_1.appendBlockChildren.method,
              query: (0, utils_1.pick)(args, api_endpoints_1.appendBlockChildren.queryParams),
              body: (0, utils_1.pick)(args, api_endpoints_1.appendBlockChildren.bodyParams),
              auth: args === null || args === undefined ? undefined : args.auth
            });
          },
          list: (args) => {
            this.warnUnknownParams(args, api_endpoints_1.listBlockChildren);
            return this.request({
              path: api_endpoints_1.listBlockChildren.path(args),
              method: api_endpoints_1.listBlockChildren.method,
              query: (0, utils_1.pick)(args, api_endpoints_1.listBlockChildren.queryParams),
              body: (0, utils_1.pick)(args, api_endpoints_1.listBlockChildren.bodyParams),
              auth: args === null || args === undefined ? undefined : args.auth
            });
          }
        }
      };
      this.databases = {
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getDatabase);
          return this.request({
            path: api_endpoints_1.getDatabase.path(args),
            method: api_endpoints_1.getDatabase.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getDatabase.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getDatabase.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        create: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.createDatabase);
          return this.request({
            path: api_endpoints_1.createDatabase.path(),
            method: api_endpoints_1.createDatabase.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.createDatabase.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.createDatabase.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        update: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.updateDatabase);
          return this.request({
            path: api_endpoints_1.updateDatabase.path(args),
            method: api_endpoints_1.updateDatabase.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.updateDatabase.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.updateDatabase.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        }
      };
      this.dataSources = {
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getDataSource);
          return this.request({
            path: api_endpoints_1.getDataSource.path(args),
            method: api_endpoints_1.getDataSource.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getDataSource.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getDataSource.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        query: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.queryDataSource);
          return this.request({
            path: api_endpoints_1.queryDataSource.path(args),
            method: api_endpoints_1.queryDataSource.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.queryDataSource.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.queryDataSource.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        create: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.createDataSource);
          return this.request({
            path: api_endpoints_1.createDataSource.path(),
            method: api_endpoints_1.createDataSource.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.createDataSource.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.createDataSource.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        update: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.updateDataSource);
          return this.request({
            path: api_endpoints_1.updateDataSource.path(args),
            method: api_endpoints_1.updateDataSource.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.updateDataSource.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.updateDataSource.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        listTemplates: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.listDataSourceTemplates);
          return this.request({
            path: api_endpoints_1.listDataSourceTemplates.path(args),
            method: api_endpoints_1.listDataSourceTemplates.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.listDataSourceTemplates.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.listDataSourceTemplates.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        }
      };
      this.pages = {
        create: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.createPage);
          return this.request({
            path: api_endpoints_1.createPage.path(),
            method: api_endpoints_1.createPage.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.createPage.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.createPage.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getPage);
          return this.request({
            path: api_endpoints_1.getPage.path(args),
            method: api_endpoints_1.getPage.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getPage.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getPage.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        update: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.updatePage);
          return this.request({
            path: api_endpoints_1.updatePage.path(args),
            method: api_endpoints_1.updatePage.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.updatePage.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.updatePage.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        move: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.movePage);
          return this.request({
            path: api_endpoints_1.movePage.path(args),
            method: api_endpoints_1.movePage.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.movePage.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.movePage.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        retrieveMarkdown: (args) => {
          return this.request({
            path: api_endpoints_1.getPageMarkdown.path(args),
            method: api_endpoints_1.getPageMarkdown.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getPageMarkdown.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getPageMarkdown.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        updateMarkdown: (args) => {
          return this.request({
            path: api_endpoints_1.updatePageMarkdown.path(args),
            method: api_endpoints_1.updatePageMarkdown.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.updatePageMarkdown.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.updatePageMarkdown.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        properties: {
          retrieve: (args) => {
            this.warnUnknownParams(args, api_endpoints_1.getPageProperty);
            return this.request({
              path: api_endpoints_1.getPageProperty.path(args),
              method: api_endpoints_1.getPageProperty.method,
              query: (0, utils_1.pick)(args, api_endpoints_1.getPageProperty.queryParams),
              body: (0, utils_1.pick)(args, api_endpoints_1.getPageProperty.bodyParams),
              auth: args === null || args === undefined ? undefined : args.auth
            });
          }
        }
      };
      this.users = {
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getUser);
          return this.request({
            path: api_endpoints_1.getUser.path(args),
            method: api_endpoints_1.getUser.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getUser.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getUser.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        list: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.listUsers);
          return this.request({
            path: api_endpoints_1.listUsers.path(),
            method: api_endpoints_1.listUsers.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.listUsers.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.listUsers.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        me: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getSelf);
          return this.request({
            path: api_endpoints_1.getSelf.path(),
            method: api_endpoints_1.getSelf.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getSelf.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getSelf.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        }
      };
      this.comments = {
        create: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.createComment);
          return this.request({
            path: api_endpoints_1.createComment.path(),
            method: api_endpoints_1.createComment.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.createComment.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.createComment.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        list: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.listComments);
          return this.request({
            path: api_endpoints_1.listComments.path(),
            method: api_endpoints_1.listComments.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.listComments.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.listComments.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getComment);
          return this.request({
            path: api_endpoints_1.getComment.path(args),
            method: api_endpoints_1.getComment.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getComment.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.getComment.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        }
      };
      this.fileUploads = {
        create: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.createFileUpload);
          return this.request({
            path: api_endpoints_1.createFileUpload.path(),
            method: api_endpoints_1.createFileUpload.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.createFileUpload.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.createFileUpload.bodyParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        retrieve: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.getFileUpload);
          return this.request({
            path: api_endpoints_1.getFileUpload.path(args),
            method: api_endpoints_1.getFileUpload.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.getFileUpload.queryParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        list: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.listFileUploads);
          return this.request({
            path: api_endpoints_1.listFileUploads.path(),
            method: api_endpoints_1.listFileUploads.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.listFileUploads.queryParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        send: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.sendFileUpload);
          return this.request({
            path: api_endpoints_1.sendFileUpload.path(args),
            method: api_endpoints_1.sendFileUpload.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.sendFileUpload.queryParams),
            formDataParams: (0, utils_1.pick)(args, api_endpoints_1.sendFileUpload.formDataParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        },
        complete: (args) => {
          this.warnUnknownParams(args, api_endpoints_1.completeFileUpload);
          return this.request({
            path: api_endpoints_1.completeFileUpload.path(args),
            method: api_endpoints_1.completeFileUpload.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.completeFileUpload.queryParams),
            auth: args === null || args === undefined ? undefined : args.auth
          });
        }
      };
      this.search = (args) => {
        this.warnUnknownParams(args, api_endpoints_1.search);
        return this.request({
          path: api_endpoints_1.search.path(),
          method: api_endpoints_1.search.method,
          query: (0, utils_1.pick)(args, api_endpoints_1.search.queryParams),
          body: (0, utils_1.pick)(args, api_endpoints_1.search.bodyParams),
          auth: args === null || args === undefined ? undefined : args.auth
        });
      };
      this.oauth = {
        token: (args) => {
          return this.request({
            path: api_endpoints_1.oauthToken.path(),
            method: api_endpoints_1.oauthToken.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.oauthToken.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.oauthToken.bodyParams),
            auth: {
              client_id: args.client_id,
              client_secret: args.client_secret
            }
          });
        },
        introspect: (args) => {
          return this.request({
            path: api_endpoints_1.oauthIntrospect.path(),
            method: api_endpoints_1.oauthIntrospect.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.oauthIntrospect.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.oauthIntrospect.bodyParams),
            auth: {
              client_id: args.client_id,
              client_secret: args.client_secret
            }
          });
        },
        revoke: (args) => {
          return this.request({
            path: api_endpoints_1.oauthRevoke.path(),
            method: api_endpoints_1.oauthRevoke.method,
            query: (0, utils_1.pick)(args, api_endpoints_1.oauthRevoke.queryParams),
            body: (0, utils_1.pick)(args, api_endpoints_1.oauthRevoke.bodyParams),
            auth: {
              client_id: args.client_id,
              client_secret: args.client_secret
            }
          });
        }
      };
      __classPrivateFieldSet(this, _Client_auth, options === null || options === undefined ? undefined : options.auth, "f");
      __classPrivateFieldSet(this, _Client_logLevel, (_a = options === null || options === undefined ? undefined : options.logLevel) !== null && _a !== undefined ? _a : logging_1.LogLevel.WARN, "f");
      __classPrivateFieldSet(this, _Client_logger, (_b = options === null || options === undefined ? undefined : options.logger) !== null && _b !== undefined ? _b : (0, logging_1.makeConsoleLogger)(package_json_1.name), "f");
      __classPrivateFieldSet(this, _Client_prefixUrl, `${(_c = options === null || options === undefined ? undefined : options.baseUrl) !== null && _c !== undefined ? _c : "https://api.notion.com"}/v1/`, "f");
      __classPrivateFieldSet(this, _Client_timeoutMs, (_d = options === null || options === undefined ? undefined : options.timeoutMs) !== null && _d !== undefined ? _d : 60000, "f");
      __classPrivateFieldSet(this, _Client_notionVersion, (_e = options === null || options === undefined ? undefined : options.notionVersion) !== null && _e !== undefined ? _e : Client.defaultNotionVersion, "f");
      __classPrivateFieldSet(this, _Client_fetch, (_f = options === null || options === undefined ? undefined : options.fetch) !== null && _f !== undefined ? _f : fetch.bind(globalThis), "f");
      __classPrivateFieldSet(this, _Client_agent, options === null || options === undefined ? undefined : options.agent, "f");
      __classPrivateFieldSet(this, _Client_userAgent, `notionhq-client/${package_json_1.version}`, "f");
      if ((options === null || options === undefined ? undefined : options.retry) === false) {
        __classPrivateFieldSet(this, _Client_maxRetries, 0, "f");
        __classPrivateFieldSet(this, _Client_initialRetryDelayMs, 0, "f");
        __classPrivateFieldSet(this, _Client_maxRetryDelayMs, 0, "f");
      } else {
        __classPrivateFieldSet(this, _Client_maxRetries, (_h = (_g = options === null || options === undefined ? undefined : options.retry) === null || _g === undefined ? undefined : _g.maxRetries) !== null && _h !== undefined ? _h : 2, "f");
        __classPrivateFieldSet(this, _Client_initialRetryDelayMs, (_k = (_j = options === null || options === undefined ? undefined : options.retry) === null || _j === undefined ? undefined : _j.initialRetryDelayMs) !== null && _k !== undefined ? _k : 1000, "f");
        __classPrivateFieldSet(this, _Client_maxRetryDelayMs, (_m = (_l = options === null || options === undefined ? undefined : options.retry) === null || _l === undefined ? undefined : _l.maxRetryDelayMs) !== null && _m !== undefined ? _m : 60000, "f");
      }
    }
    async request(args) {
      const { path, method, query, body, formDataParams, auth } = args;
      (0, errors_1.validateRequestPath)(path);
      this.log(logging_1.LogLevel.INFO, "request start", { method, path });
      const url = this.buildRequestUrl(path, query);
      const bodyAsJsonString = this.serializeBody(body);
      const headers = this.buildRequestHeaders(args.headers, auth, bodyAsJsonString);
      const formData = this.buildFormData(formDataParams, headers);
      return this.executeWithRetry({
        url,
        method,
        path,
        headers,
        body: bodyAsJsonString !== null && bodyAsJsonString !== undefined ? bodyAsJsonString : formData
      });
    }
    buildRequestUrl(path, query) {
      const url = new URL(`${__classPrivateFieldGet(this, _Client_prefixUrl, "f")}${path}`);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              for (const val of value) {
                url.searchParams.append(key, decodeURIComponent(val));
              }
            } else {
              url.searchParams.append(key, String(value));
            }
          }
        }
      }
      return url;
    }
    serializeBody(body) {
      if (!body || Object.entries(body).length === 0) {
        return;
      }
      return JSON.stringify(body);
    }
    buildRequestHeaders(customHeaders, auth, bodyAsJsonString) {
      const authorizationHeader = this.buildAuthHeader(auth);
      const headers = {
        ...customHeaders,
        ...authorizationHeader,
        "Notion-Version": __classPrivateFieldGet(this, _Client_notionVersion, "f"),
        "user-agent": __classPrivateFieldGet(this, _Client_userAgent, "f")
      };
      if (bodyAsJsonString !== undefined) {
        headers["content-type"] = "application/json";
      }
      return headers;
    }
    buildAuthHeader(auth) {
      if (typeof auth === "object") {
        const unencodedCredential = `${auth.client_id}:${auth.client_secret}`;
        const encodedCredential = Buffer.from(unencodedCredential).toString("base64");
        return { authorization: `Basic ${encodedCredential}` };
      }
      return this.authAsHeaders(auth);
    }
    buildFormData(formDataParams, headers) {
      if (!formDataParams) {
        return;
      }
      delete headers["content-type"];
      const formData = new FormData;
      for (const [key, value] of Object.entries(formDataParams)) {
        if (typeof value === "string") {
          formData.append(key, value);
        } else if (typeof value === "object") {
          formData.append(key, typeof value.data === "object" ? value.data : new Blob([value.data]), value.filename);
        }
      }
      return formData;
    }
    async executeWithRetry(args) {
      const { url, method, path, headers, body } = args;
      let attempt = 0;
      while (true) {
        try {
          return await this.executeSingleRequest({
            url,
            method,
            path,
            headers,
            body
          });
        } catch (error) {
          if (!(0, errors_1.isNotionClientError)(error)) {
            throw error;
          }
          this.logRequestError(error, attempt);
          if (attempt < __classPrivateFieldGet(this, _Client_maxRetries, "f") && this.canRetry(error, method)) {
            const delayMs = this.calculateRetryDelay(error, attempt);
            this.log(logging_1.LogLevel.INFO, "retrying request", {
              method,
              path,
              attempt: attempt + 1,
              delayMs
            });
            await this.sleep(delayMs);
            attempt++;
            continue;
          }
          throw error;
        }
      }
    }
    async executeSingleRequest(args) {
      const { url, method, path, headers, body } = args;
      const response = await errors_1.RequestTimeoutError.rejectAfterTimeout(__classPrivateFieldGet(this, _Client_fetch, "f").call(this, url.toString(), {
        method: method.toUpperCase(),
        headers,
        body,
        agent: __classPrivateFieldGet(this, _Client_agent, "f")
      }), __classPrivateFieldGet(this, _Client_timeoutMs, "f"));
      const responseText = await response.text();
      if (!response.ok) {
        throw (0, errors_1.buildRequestError)(response, responseText);
      }
      const responseJson = JSON.parse(responseText);
      this.log(logging_1.LogLevel.INFO, "request success", {
        method,
        path,
        ...this.extractRequestId(responseJson)
      });
      return responseJson;
    }
    logRequestError(error, attempt) {
      this.log(logging_1.LogLevel.WARN, "request fail", {
        code: error.code,
        message: error.message,
        attempt,
        ...this.extractRequestId(error)
      });
      if ((0, errors_1.isHTTPResponseError)(error)) {
        this.log(logging_1.LogLevel.DEBUG, "failed response body", {
          body: error.body
        });
      }
    }
    extractRequestId(obj) {
      if (obj && typeof obj === "object" && "request_id" in obj && typeof obj.request_id === "string") {
        return { requestId: obj.request_id };
      }
      return {};
    }
    canRetry(error, method) {
      if (!errors_1.APIResponseError.isAPIResponseError(error)) {
        return false;
      }
      if (error.code === errors_1.APIErrorCode.RateLimited) {
        return true;
      }
      const isIdempotent = method === "get" || method === "delete";
      if (isIdempotent) {
        return error.code === errors_1.APIErrorCode.InternalServerError || error.code === errors_1.APIErrorCode.ServiceUnavailable;
      }
      return false;
    }
    calculateRetryDelay(error, attempt) {
      if (errors_1.APIResponseError.isAPIResponseError(error)) {
        const retryAfterMs = this.parseRetryAfterHeader(error.headers);
        if (retryAfterMs !== undefined) {
          return Math.min(retryAfterMs, __classPrivateFieldGet(this, _Client_maxRetryDelayMs, "f"));
        }
      }
      const baseDelay = __classPrivateFieldGet(this, _Client_initialRetryDelayMs, "f") * Math.pow(2, attempt);
      const jitter = Math.random();
      return Math.min(baseDelay * jitter + baseDelay / 2, __classPrivateFieldGet(this, _Client_maxRetryDelayMs, "f"));
    }
    parseRetryAfterHeader(headers) {
      var _a, _b;
      if (!headers) {
        return;
      }
      let retryAfterValue = null;
      if (typeof headers === "object" && "get" in headers) {
        const headersObj = headers;
        retryAfterValue = headersObj.get("retry-after");
      } else if (typeof headers === "object") {
        const headersRecord = headers;
        retryAfterValue = (_b = (_a = headersRecord["retry-after"]) !== null && _a !== undefined ? _a : headersRecord["Retry-After"]) !== null && _b !== undefined ? _b : null;
      }
      if (!retryAfterValue) {
        return;
      }
      const seconds = parseInt(retryAfterValue, 10);
      if (!isNaN(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
      const date = Date.parse(retryAfterValue);
      if (!isNaN(date)) {
        const delayMs = date - Date.now();
        return delayMs > 0 ? delayMs : 0;
      }
      return;
    }
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    warnUnknownParams(args, endpoint) {
      var _a;
      if (!args || typeof args !== "object")
        return;
      const unknownKeys = (0, utils_1.getUnknownParams)(args, endpoint);
      if (unknownKeys.length > 0) {
        this.log(logging_1.LogLevel.WARN, "unknown parameters were ignored", {
          unknownParams: unknownKeys,
          knownParams: [
            ...endpoint.pathParams,
            ...endpoint.queryParams,
            ...endpoint.bodyParams,
            ...(_a = endpoint.formDataParams) !== null && _a !== undefined ? _a : []
          ]
        });
      }
    }
    log(level, message, extraInfo) {
      if ((0, logging_1.logLevelSeverity)(level) >= (0, logging_1.logLevelSeverity)(__classPrivateFieldGet(this, _Client_logLevel, "f"))) {
        __classPrivateFieldGet(this, _Client_logger, "f").call(this, level, message, extraInfo);
      }
    }
    authAsHeaders(auth) {
      const headers = {};
      const authHeaderValue = auth !== null && auth !== undefined ? auth : __classPrivateFieldGet(this, _Client_auth, "f");
      if (authHeaderValue !== undefined) {
        headers["authorization"] = `Bearer ${authHeaderValue}`;
      }
      return headers;
    }
  }
  _Client_auth = new WeakMap, _Client_logLevel = new WeakMap, _Client_logger = new WeakMap, _Client_prefixUrl = new WeakMap, _Client_timeoutMs = new WeakMap, _Client_notionVersion = new WeakMap, _Client_fetch = new WeakMap, _Client_agent = new WeakMap, _Client_userAgent = new WeakMap, _Client_maxRetries = new WeakMap, _Client_initialRetryDelayMs = new WeakMap, _Client_maxRetryDelayMs = new WeakMap;
  Client.defaultNotionVersion = "2025-09-03";
  exports.default = Client;
});

// ../../node_modules/@notionhq/client/build/src/helpers.js
var require_helpers = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.iteratePaginatedAPI = iteratePaginatedAPI;
  exports.collectPaginatedAPI = collectPaginatedAPI;
  exports.iterateDataSourceTemplates = iterateDataSourceTemplates;
  exports.collectDataSourceTemplates = collectDataSourceTemplates;
  exports.isFullBlock = isFullBlock;
  exports.isFullPage = isFullPage;
  exports.isFullDataSource = isFullDataSource;
  exports.isFullDatabase = isFullDatabase;
  exports.isFullPageOrDataSource = isFullPageOrDataSource;
  exports.isFullUser = isFullUser;
  exports.isFullComment = isFullComment;
  exports.isTextRichTextItemResponse = isTextRichTextItemResponse;
  exports.isEquationRichTextItemResponse = isEquationRichTextItemResponse;
  exports.isMentionRichTextItemResponse = isMentionRichTextItemResponse;
  exports.extractNotionId = extractNotionId;
  exports.extractDatabaseId = extractDatabaseId;
  exports.extractPageId = extractPageId;
  exports.extractBlockId = extractBlockId;
  async function* iteratePaginatedAPI(listFn, firstPageArgs) {
    let nextCursor = firstPageArgs.start_cursor;
    do {
      const response = await listFn({
        ...firstPageArgs,
        start_cursor: nextCursor
      });
      yield* response.results;
      nextCursor = response.next_cursor;
    } while (nextCursor);
  }
  async function collectPaginatedAPI(listFn, firstPageArgs) {
    const results = [];
    for await (const item of iteratePaginatedAPI(listFn, firstPageArgs)) {
      results.push(item);
    }
    return results;
  }
  async function* iterateDataSourceTemplates(client, args) {
    let nextCursor = args.start_cursor;
    do {
      const response = await client.dataSources.listTemplates({
        ...args,
        start_cursor: nextCursor
      });
      yield* response.templates;
      nextCursor = response.next_cursor;
    } while (nextCursor);
  }
  async function collectDataSourceTemplates(client, args) {
    const results = [];
    for await (const template of iterateDataSourceTemplates(client, args)) {
      results.push(template);
    }
    return results;
  }
  function isFullBlock(response) {
    return response.object === "block" && "type" in response;
  }
  function isFullPage(response) {
    return response.object === "page" && "url" in response;
  }
  function isFullDataSource(response) {
    return response.object === "data_source";
  }
  function isFullDatabase(response) {
    return response.object === "database";
  }
  function isFullPageOrDataSource(response) {
    if (response.object === "data_source") {
      return isFullDataSource(response);
    } else {
      return isFullPage(response);
    }
  }
  function isFullUser(response) {
    return "type" in response;
  }
  function isFullComment(response) {
    return "created_by" in response;
  }
  function isTextRichTextItemResponse(richText) {
    return richText.type === "text";
  }
  function isEquationRichTextItemResponse(richText) {
    return richText.type === "equation";
  }
  function isMentionRichTextItemResponse(richText) {
    return richText.type === "mention";
  }
  function extractNotionId(urlOrId) {
    if (!urlOrId || typeof urlOrId !== "string") {
      return null;
    }
    const trimmed = urlOrId.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    const compactUuidRegex = /^[0-9a-f]{32}$/i;
    if (compactUuidRegex.test(trimmed)) {
      return formatUuid(trimmed);
    }
    const pathMatch = trimmed.match(/\/[^/?#]*-([0-9a-f]{32})(?:[/?#]|$)/i);
    if (pathMatch && pathMatch[1]) {
      return formatUuid(pathMatch[1]);
    }
    const queryMatch = trimmed.match(/[?&](?:p|page_id|database_id)=([0-9a-f]{32})/i);
    if (queryMatch && queryMatch[1]) {
      return formatUuid(queryMatch[1]);
    }
    const anyMatch = trimmed.match(/([0-9a-f]{32})/i);
    if (anyMatch && anyMatch[1]) {
      return formatUuid(anyMatch[1]);
    }
    return null;
  }
  function formatUuid(compactId) {
    const clean = compactId.toLowerCase();
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
  }
  function extractDatabaseId(databaseUrl) {
    return extractNotionId(databaseUrl);
  }
  function extractPageId(pageUrl) {
    return extractNotionId(pageUrl);
  }
  function extractBlockId(urlWithBlock) {
    if (!urlWithBlock || typeof urlWithBlock !== "string") {
      return null;
    }
    const blockMatch = urlWithBlock.match(/#(?:block-)?([0-9a-f]{32})/i);
    if (blockMatch && blockMatch[1]) {
      return formatUuid(blockMatch[1]);
    }
    return null;
  }
});

// ../../node_modules/@notionhq/client/build/src/index.js
var require_src = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.extractBlockId = exports.extractPageId = exports.extractDatabaseId = exports.extractNotionId = exports.isFullPageOrDataSource = exports.isFullComment = exports.isFullUser = exports.isFullPage = exports.isFullDatabase = exports.isFullDataSource = exports.isFullBlock = exports.iterateDataSourceTemplates = exports.collectDataSourceTemplates = exports.iteratePaginatedAPI = exports.collectPaginatedAPI = exports.isHTTPResponseError = exports.isNotionClientError = exports.InvalidPathParameterError = exports.RequestTimeoutError = exports.UnknownHTTPResponseError = exports.APIResponseError = exports.ClientErrorCode = exports.APIErrorCode = exports.LogLevel = exports.Client = undefined;
  var Client_1 = require_Client();
  Object.defineProperty(exports, "Client", { enumerable: true, get: function() {
    return Client_1.default;
  } });
  var logging_1 = require_logging();
  Object.defineProperty(exports, "LogLevel", { enumerable: true, get: function() {
    return logging_1.LogLevel;
  } });
  var errors_1 = require_errors();
  Object.defineProperty(exports, "APIErrorCode", { enumerable: true, get: function() {
    return errors_1.APIErrorCode;
  } });
  Object.defineProperty(exports, "ClientErrorCode", { enumerable: true, get: function() {
    return errors_1.ClientErrorCode;
  } });
  Object.defineProperty(exports, "APIResponseError", { enumerable: true, get: function() {
    return errors_1.APIResponseError;
  } });
  Object.defineProperty(exports, "UnknownHTTPResponseError", { enumerable: true, get: function() {
    return errors_1.UnknownHTTPResponseError;
  } });
  Object.defineProperty(exports, "RequestTimeoutError", { enumerable: true, get: function() {
    return errors_1.RequestTimeoutError;
  } });
  Object.defineProperty(exports, "InvalidPathParameterError", { enumerable: true, get: function() {
    return errors_1.InvalidPathParameterError;
  } });
  Object.defineProperty(exports, "isNotionClientError", { enumerable: true, get: function() {
    return errors_1.isNotionClientError;
  } });
  Object.defineProperty(exports, "isHTTPResponseError", { enumerable: true, get: function() {
    return errors_1.isHTTPResponseError;
  } });
  var helpers_1 = require_helpers();
  Object.defineProperty(exports, "collectPaginatedAPI", { enumerable: true, get: function() {
    return helpers_1.collectPaginatedAPI;
  } });
  Object.defineProperty(exports, "iteratePaginatedAPI", { enumerable: true, get: function() {
    return helpers_1.iteratePaginatedAPI;
  } });
  Object.defineProperty(exports, "collectDataSourceTemplates", { enumerable: true, get: function() {
    return helpers_1.collectDataSourceTemplates;
  } });
  Object.defineProperty(exports, "iterateDataSourceTemplates", { enumerable: true, get: function() {
    return helpers_1.iterateDataSourceTemplates;
  } });
  Object.defineProperty(exports, "isFullBlock", { enumerable: true, get: function() {
    return helpers_1.isFullBlock;
  } });
  Object.defineProperty(exports, "isFullDataSource", { enumerable: true, get: function() {
    return helpers_1.isFullDataSource;
  } });
  Object.defineProperty(exports, "isFullDatabase", { enumerable: true, get: function() {
    return helpers_1.isFullDatabase;
  } });
  Object.defineProperty(exports, "isFullPage", { enumerable: true, get: function() {
    return helpers_1.isFullPage;
  } });
  Object.defineProperty(exports, "isFullUser", { enumerable: true, get: function() {
    return helpers_1.isFullUser;
  } });
  Object.defineProperty(exports, "isFullComment", { enumerable: true, get: function() {
    return helpers_1.isFullComment;
  } });
  Object.defineProperty(exports, "isFullPageOrDataSource", { enumerable: true, get: function() {
    return helpers_1.isFullPageOrDataSource;
  } });
  Object.defineProperty(exports, "extractNotionId", { enumerable: true, get: function() {
    return helpers_1.extractNotionId;
  } });
  Object.defineProperty(exports, "extractDatabaseId", { enumerable: true, get: function() {
    return helpers_1.extractDatabaseId;
  } });
  Object.defineProperty(exports, "extractPageId", { enumerable: true, get: function() {
    return helpers_1.extractPageId;
  } });
  Object.defineProperty(exports, "extractBlockId", { enumerable: true, get: function() {
    return helpers_1.extractBlockId;
  } });
});

// src/core/sync-vcs-to-notion.ts
import fs2 from "fs";
import path2 from "path";

// src/lib/external/notion-client.ts
var import_client = __toESM(require_src(), 1);
import fs from "fs";
import path from "path";
var __dirname = "/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/lib/external";
function getNotionKey() {
  if (process.env.NOTION_API_KEY) {
    return process.env.NOTION_API_KEY;
  }
  const configPath = path.resolve(__dirname, "../../../config/notion-config.json");
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.notionApiKey) {
        return config.notionApiKey;
      }
    }
  } catch (e) {}
  const legacyPath = path.resolve(process.env.HOME || "", ".openclaw/workspace/config/credentials.json");
  try {
    if (fs.existsSync(legacyPath)) {
      const creds = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
      if (creds?.notion?.apiKey) {
        return creds.notion.apiKey;
      }
    }
  } catch (e) {}
  throw new Error("NOTION_API_KEY not found. Set NOTION_API_KEY env var or configure in config/notion-config.json");
}
function getClient(notionKey) {
  const key = notionKey || getNotionKey();
  return new import_client.Client({ auth: key });
}

// src/core/sync-vcs-to-notion.ts
var __dirname = "/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/core";
var RATE_LIMIT_DELAY = 350;
var getDatabaseId = () => {
  if (process.env.NOTION_VC_DATABASE_ID) {
    return process.env.NOTION_VC_DATABASE_ID;
  }
  return "305334874af681ef983df57c7f70de33";
};
function loadSentEmails() {
  const skillDataPath = path2.resolve(__dirname, "../../data/sent-emails.json");
  const legacyPath = path2.join(process.env.HOME || "", ".openclaw/workspace/skills/alygn-outreach/data/sent-emails.json");
  try {
    if (fs2.existsSync(skillDataPath)) {
      return JSON.parse(fs2.readFileSync(skillDataPath, "utf8"));
    }
    if (fs2.existsSync(legacyPath)) {
      return JSON.parse(fs2.readFileSync(legacyPath, "utf8"));
    }
  } catch (error) {
    console.warn(`   \u26A0\uFE0F  Could not load sent-emails.json: ${error.message}`);
  }
  return { vcs: [], municipalities: [], lastUpdated: null };
}
function vcExistsInSentEmails(sentEmails, vcName, email) {
  if (email) {
    const byEmail = sentEmails.vcs.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
    if (byEmail) {
      return {
        exists: true,
        source: "sent-emails",
        vcName: byEmail.vcName,
        sentAt: byEmail.sentAt
      };
    }
  }
  const byName = sentEmails.vcs.find((entry) => entry.vcName.toLowerCase() === vcName.toLowerCase());
  if (byName) {
    return {
      exists: true,
      source: "sent-emails",
      vcName: byName.vcName,
      sentAt: byName.sentAt
    };
  }
  return { exists: false, source: null };
}
async function vcExistsInNotionByEmail(email) {
  if (!email)
    return { exists: false, source: null };
  try {
    const notion = getClient();
    const DATABASE_ID = getDatabaseId();
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: "Email",
        email: {
          equals: email
        }
      }
    });
    if (response.results.length > 0) {
      const page = response.results[0];
      const nameProp = page.properties["Name"];
      const vcName = nameProp?.title?.[0]?.text?.content;
      return {
        exists: true,
        source: "notion-email",
        pageId: page.id,
        vcName
      };
    }
    return { exists: false, source: null };
  } catch (error) {
    console.error(`\u274C Error checking Notion by email: ${error.message}`);
    return { exists: false, source: null };
  }
}
async function vcExistsInNotionByName(vcName) {
  if (!vcName)
    return { exists: false, source: null };
  try {
    const notion = getClient();
    const DATABASE_ID = getDatabaseId();
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: "Name",
        title: {
          contains: vcName
        }
      }
    });
    const exactMatch = response.results.find((result) => {
      const page = result;
      const nameProp = page.properties["Name"];
      const name = nameProp?.title?.[0]?.text?.content || "";
      return name.toLowerCase() === vcName.toLowerCase();
    });
    if (exactMatch) {
      const page = exactMatch;
      return {
        exists: true,
        source: "notion-name",
        pageId: page.id,
        vcName
      };
    }
    return { exists: false, source: null };
  } catch (error) {
    console.error(`\u274C Error checking Notion by name: ${error.message}`);
    return { exists: false, source: null };
  }
}
async function checkVCExists(vc) {
  const sentEmails = loadSentEmails();
  const sentEmailResult = vcExistsInSentEmails(sentEmails, vc.name, vc.email);
  if (sentEmailResult.exists) {
    console.log(`   \uD83D\uDCCB Found in sent-emails.json (sent on ${new Date(sentEmailResult.sentAt || "").toLocaleDateString()})`);
    return sentEmailResult;
  }
  if (vc.email) {
    const emailResult = await vcExistsInNotionByEmail(vc.email);
    if (emailResult.exists) {
      console.log(`   \uD83D\uDCCA Found in Notion by email (Page ID: ${emailResult.pageId})`);
      return emailResult;
    }
  }
  const nameResult = await vcExistsInNotionByName(vc.name);
  if (nameResult.exists) {
    console.log(`   \uD83D\uDCCA Found in Notion by name (Page ID: ${nameResult.pageId})`);
    return nameResult;
  }
  return { exists: false, source: null };
}
async function createVCInNotion(vc, existingPageId) {
  const notion = getClient();
  const DATABASE_ID = getDatabaseId();
  const properties = {
    Name: {
      title: [{ text: { content: vc.name } }]
    },
    Email: {
      email: vc.email || null
    },
    Website: {
      url: vc.website || null
    },
    Status: {
      select: { name: "Not contacted" }
    },
    "Relevance Score": {
      number: vc.relevanceScore || 0
    },
    "Focus Areas": {
      multi_select: (vc.focusAreas || []).map((area) => ({ name: area }))
    },
    "Pain Points": {
      multi_select: (vc.painPoints || []).map((point) => ({ name: point }))
    },
    Partners: {
      rich_text: [{ text: { content: vc.partners || "" } }]
    }
  };
  try {
    if (existingPageId) {
      const response2 = await notion.pages.update({
        page_id: existingPageId,
        properties
      });
      console.log(`   \uD83D\uDCDD Updated existing Notion page: ${existingPageId}`);
      return { id: response2.id, created: false };
    }
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties
    });
    return { id: response.id, created: true };
  } catch (error) {
    console.error(`\u274C Failed to create/update VC: ${error.message}`);
    throw error;
  }
}
function loadVCsFromFile(inputPath) {
  try {
    const data = fs2.readFileSync(inputPath, "utf8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.vcs && Array.isArray(parsed.vcs)) {
      return parsed.vcs;
    } else {
      console.error(`\u274C JSON file ${inputPath} has unexpected format`);
      return [];
    }
  } catch (error) {
    console.error(`\u274C Failed to load VCs from ${inputPath}:`, error.message);
    return [];
  }
}
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const inputArg = args.find((a) => a.startsWith("--input="));
  const DEFAULT_INPUT = `${process.env.HOME}/.openclaw/workspace/reports/alygn/alygn-vc-complete-${new Date().toISOString().split("T")[0]}.json`;
  const inputPath = inputArg ? inputArg.split("=")[1] : DEFAULT_INPUT;
  console.log(`\uD83D\uDE80 ALYGN VC Sync to Notion
`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Dry run: ${dryRun ? "YES" : "NO"}
`);
  const vcs = loadVCsFromFile(inputPath);
  if (vcs.length === 0) {
    console.log(`\u26A0\uFE0F  No VCs to sync
`);
    return;
  }
  console.log(`\uD83D\uDCCA Found ${vcs.length} VCs
`);
  const stats = {
    created: 0,
    duplicates: 0,
    failed: 0
  };
  for (const vc of vcs) {
    console.log(`Processing: ${vc.name}`);
    const existingCheck = await checkVCExists(vc);
    if (existingCheck.exists) {
      console.log(`  \u23ED\uFE0F  DUPLICATE found (${existingCheck.source}): ${vc.name}`);
      if (existingCheck.sentAt) {
        console.log(`       Previously sent: ${new Date(existingCheck.sentAt).toLocaleDateString()}`);
      }
      if (existingCheck.pageId) {
        console.log(`       Notion Page ID: ${existingCheck.pageId}`);
      }
      stats.duplicates++;
      continue;
    }
    if (dryRun) {
      console.log(`  [DRY RUN] Would create: ${vc.name}`);
      stats.created++;
      continue;
    }
    try {
      const result = await createVCInNotion(vc);
      if (result.created) {
        console.log(`  \u2705 Created: ${vc.name} (ID: ${result.id})`);
      } else {
        console.log(`  \uD83D\uDCDD Updated existing: ${vc.name} (ID: ${result.id})`);
      }
      stats.created++;
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));
    } catch (error) {
      console.error(`  \u274C Failed: ${vc.name} - ${error.message}`);
      stats.failed++;
    }
  }
  console.log(`
` + "=".repeat(60));
  console.log(`
\u2705 Sync complete!`);
  console.log(`   Created: ${stats.created}`);
  console.log(`   Duplicates: ${stats.duplicates}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log("=".repeat(60) + `
`);
}
main().catch((error) => {
  console.error("\u274C Error:", error.message);
  process.exit(1);
});
export {
  vcExistsInSentEmails,
  vcExistsInNotionByName,
  vcExistsInNotionByEmail,
  loadVCsFromFile,
  loadSentEmails,
  createVCInNotion,
  checkVCExists
};
