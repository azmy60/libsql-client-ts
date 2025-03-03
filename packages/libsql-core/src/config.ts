import type { Config, IntMode } from "./api.js";
import { LibsqlError } from "./api.js";
import type { Authority } from "./uri.js";
import { parseUri } from "./uri.js";
import { supportedUrlLink } from "./util.js";

export interface ExpandedConfig {
    scheme: ExpandedScheme;
    tls: boolean;
    authority: Authority | undefined;
    path: string;
    authToken: string | undefined;
    encryptionKey: string | undefined;
    syncUrl: string | undefined;
    syncInterval: number | undefined;
    intMode: IntMode;
    fetch: Function | undefined;
}

export type ExpandedScheme = "wss" | "ws" | "https" | "http" | "file";

export function expandConfig(
    config: Config,
    preferHttp: boolean,
): ExpandedConfig {
    if (typeof config !== "object") {
        // produce a reasonable error message in the common case where users type
        // `createClient("libsql://...")` instead of `createClient({url: "libsql://..."})`
        throw new TypeError(
            `Expected client configuration as object, got ${typeof config}`,
        );
    }

    let tls: boolean | undefined = config.tls;
    let authToken = config.authToken;
    let encryptionKey = config.encryptionKey;
    let syncUrl = config.syncUrl;
    let syncInterval = config.syncInterval;
    const intMode = "" + (config.intMode ?? "number");
    if (intMode !== "number" && intMode !== "bigint" && intMode !== "string") {
        throw new TypeError(
            `Invalid value for intMode, expected "number", "bigint" or "string", \
            got ${JSON.stringify(intMode)}`,
        );
    }

    if (config.url === ":memory:") {
        return {
            path: ":memory:",
            scheme: "file",
            syncUrl,
            syncInterval,
            intMode,
            fetch: config.fetch,
            tls: false,
            authToken: undefined,
            encryptionKey: undefined,
            authority: undefined,
        };
    }

    const uri = parseUri(config.url);
    for (const { key, value } of uri.query?.pairs ?? []) {
        if (key === "authToken") {
            authToken = value ? value : undefined;
        } else if (key === "tls") {
            if (value === "0") {
                tls = false;
            } else if (value === "1") {
                tls = true;
            } else {
                throw new LibsqlError(
                    `Unknown value for the "tls" query argument: ${JSON.stringify(value)}. ` +
                        'Supported values are "0" and "1"',
                    "URL_INVALID",
                );
            }
        } else {
            throw new LibsqlError(
                `Unknown URL query parameter ${JSON.stringify(key)}`,
                "URL_PARAM_NOT_SUPPORTED",
            );
        }
    }

    const uriScheme = uri.scheme.toLowerCase();
    let scheme: ExpandedScheme;
    if (uriScheme === "libsql") {
        if (tls === false) {
            if (uri.authority?.port === undefined) {
                throw new LibsqlError(
                    'A "libsql:" URL with ?tls=0 must specify an explicit port',
                    "URL_INVALID",
                );
            }
            scheme = preferHttp ? "http" : "ws";
        } else {
            scheme = preferHttp ? "https" : "wss";
        }
    } else if (uriScheme === "http" || uriScheme === "ws") {
        scheme = uriScheme;
        tls ??= false;
    } else if (
        uriScheme === "https" ||
        uriScheme === "wss" ||
        uriScheme === "file"
    ) {
        scheme = uriScheme;
    } else {
        throw new LibsqlError(
            'The client supports only "libsql:", "wss:", "ws:", "https:", "http:" and "file:" URLs, ' +
                `got ${JSON.stringify(uri.scheme + ":")}. ` +
                `For more information, please read ${supportedUrlLink}`,
            "URL_SCHEME_NOT_SUPPORTED",
        );
    }

    if (uri.fragment !== undefined) {
        throw new LibsqlError(
            `URL fragments are not supported: ${JSON.stringify("#" + uri.fragment)}`,
            "URL_INVALID",
        );
    }

    return {
        scheme,
        tls: tls ?? true,
        authority: uri.authority,
        path: uri.path,
        authToken,
        encryptionKey,
        syncUrl,
        syncInterval,
        intMode,
        fetch: config.fetch,
    };
}
