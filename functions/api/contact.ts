import {
    validateSubmission,
    normalizeSubmission
} from "../lib/contact-validation";

import {verifyTurnstile} from "../lib/turnstile";

export class InvalidEncodingError extends Error {
    constructor() {
        super("Request body contains invalid UTF-8");
        this.name = "InvalidEncodingError";
    }
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {

    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new RangeError("maxBytes must be a positive integer");
    }

    if (request.body === null) {
        return "";
    }

    const reader = request.body.getReader();

    let totalBytes = 0;
    const chunks: Uint8Array[] = [];

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            totalBytes += value.byteLength;

            if (totalBytes > maxBytes) {
                try {
                    await reader.cancel();
                } catch (error) {
                    console.warn("Failed to cancel oversized request stream:", error);
                }

                return null;
            }

            chunks.push(value);
        }

        const combined = new Uint8Array(totalBytes);
        let offset = 0;

        for (let i = 0, len = chunks.length; i < len; i++) {
            combined.set(chunks[i], offset);
            offset += chunks[i].byteLength;
        }

        const decoder = new TextDecoder("utf-8", { fatal: true});

        try {
            return decoder.decode(combined);
        } catch (error) {
            throw new InvalidEncodingError();
        }

    } finally {
        reader.releaseLock();
    }
}

interface Env {
    TURNSTILE_SECRET_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {

    const request = context.request;

    const contentType = request.headers.get("content-type");

    const isJson = contentType
        ?.split(";")[0]
        .trim()
        .toLowerCase() === "application/json";

    if (!isJson) {
        return Response.json(
            {
                success: false,
                message: "Unsupported Media Type"
            },
            {
                status: 415
            }
        );
    }

    try {
        const body = await readLimitedBody(request, 16 * 1024);
        if (body === null) {
            return Response.json(
                {
                    success: false,
                    message: "Request body exceeds maximum size"
                },
                {
                    status: 413
                }
            );
        }

        let data: unknown;
        try {
            data = JSON.parse(body);
        } catch {
            return Response.json(
                {
                    success: false,
                    message: "Malformed JSON request"
                },
                {
                    status: 400
                }
            );
        }

        if (!validateSubmission(data)) {
            return Response.json(
                {
                    success: false,
                    message: "Invalid contact submission"
                },
                {
                    status: 400
                }
            );
        }

        const normalized = normalizeSubmission(data);

        const token = (
            typeof data === "object" && data !== null && "turnstileToken" in data
        ) ? data.turnstileToken : undefined;

        if (
            typeof token !== "string" ||
            token.length === 0 ||
            token.length > 2048
        ) {
            return Response.json(
                {
                    success: false,
                    message: "Missing or invalid security token"
                },
                {
                    status: 403
                }
            );
        }

        const secret = context.env.TURNSTILE_SECRET_KEY;

        if (!secret) {
            console.error("Turnstile secret is not configured.");

            return Response.json(
                {
                    success: false,
                    message: "Security verification unavailable"
                },
                {
                    status: 503
                }
            );
        }

        const verifiedContact = await verifyTurnstile(token, secret);

        if (!verifiedContact) {
            return Response.json(
                {
                    success: false,
                    message: "Security verification failed"
                },
                {
                    status: 403
                }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Received submission from " + normalized.name
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                }
            }
        );
    } catch (error) {
        if (error instanceof InvalidEncodingError) {
            return Response.json(
                {
                    success: false,
                    message: "Request body contains invalid UTF-8"
                },
                {
                    status: 400
                }
            );
        } else {
            console.error("Contact API request failed.", error);
            return Response.json(
                {
                    success: false,
                    message: "Unexpected Error"
                },
                {
                    status: 500
                }
            );
        }
    }
};

export const onRequest: PagesFunction = async () => {
    return new Response(
        JSON.stringify({
            success: false,
            message: "Method Not Allowed"
        }),
        {
            status: 405,
            headers: {
                "Content-Type": "application/json",
                "Allow": "POST",
            }
        }
    )
}