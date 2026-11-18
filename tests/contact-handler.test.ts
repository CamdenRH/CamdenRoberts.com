import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    onRequestPost,
    onRequest
} from "../functions/api/contact";

import {
    verifyTurnstile
} from "../functions/lib/turnstile";

import {
    sendContactEmail
} from "../functions/lib/email";

// ============================================================
// EXTERNAL SERVICE MOCKS
// ============================================================

vi.mock("../functions/lib/turnstile", () => ({
    verifyTurnstile: vi.fn()
}));

vi.mock("../functions/lib/email", () => ({
    sendContactEmail: vi.fn()
}));

const mockedVerifyTurnstile = vi.mocked(verifyTurnstile);
const mockedSendContactEmail = vi.mocked(sendContactEmail);

const API_URL = "http://localhost/api/contact";
const TEST_TOKEN = "test-turnstile-token";
const TEST_TURNSTILE_SECRET = "test-turnstile-secret";
const TEST_RESEND_KEY = "re_test_key";
const TEST_EMAIL_ID = "email_test_123";

const TEST_HOSTNAME = "camdenroberts.com"

interface ApiResponse {
    success: boolean;
    message: string;
}

interface TestEnvironment {
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_EXPECTED_HOSTNAME?: string;
    RESEND_API_KEY?: string;
}

function createValidSubmission(
    overrides: Record<string, unknown> = {}
) {
    return {
        name: "Camden",
        email: "camden@example.com",
        subject: "Employment opportunity",
        message: "Hello from the contact form.",
        turnstileToken: TEST_TOKEN,
        ...overrides
    };
}

function createRequest(
    body: BodyInit,
    method = "POST",
    contentType = "application/json"
): Request {
    return new Request(API_URL, {
        method,
        headers: {
            "Content-Type": contentType
        },
        body
    });
}

function createTestEnvironment(): TestEnvironment {
    return {
        TURNSTILE_SECRET_KEY: TEST_TURNSTILE_SECRET,
        TURNSTILE_EXPECTED_HOSTNAME: TEST_HOSTNAME,
        RESEND_API_KEY: TEST_RESEND_KEY
    };
}

async function invokeHandler(
    request: Request,
    env: TestEnvironment = createTestEnvironment()
): Promise<Response> {
    const context = {
        request,
        env
    } as Parameters<typeof onRequestPost>[0];

    return await onRequestPost(context) as Response;
}

async function submit(
    data: unknown,
    env: TestEnvironment = createTestEnvironment()
): Promise<Response> {
    return invokeHandler(
        createRequest(JSON.stringify(data)),
        env
    );
}

async function readApiResponse(
    response: Response
): Promise<ApiResponse> {
    return await response.json() as ApiResponse;
}

beforeEach(() => {
    vi.resetAllMocks();

    mockedVerifyTurnstile.mockResolvedValue(true);
    mockedSendContactEmail.mockResolvedValue(TEST_EMAIL_ID);
});

// ============================================================
// SUCCESSFUL SUBMISSIONS
// ============================================================

describe("contact handler - successful submissions", () => {

    it("returns HTTP 200 for a valid verified submission", async () => {
        const response = await submit(createValidSubmission());

        expect(response.status).toBe(200);

        const body = await readApiResponse(response);

        expect(body.success).toBe(true);
        expect(body.message).toBe(
            "Message accepted for delivery"
        );
    });

    it("returns a JSON response", async () => {
        const response = await submit(createValidSubmission());

        expect(
            response.headers.get("content-type")
        ).toContain("application/json");
    });

    it("passes the correct token, secret, and hostname to Turnstile", async () => {
        await submit(createValidSubmission());

        expect(mockedVerifyTurnstile).toHaveBeenCalledOnce();
        expect(mockedVerifyTurnstile).toHaveBeenCalledWith(
            TEST_TOKEN,
            TEST_TURNSTILE_SECRET,
            TEST_HOSTNAME,
        );
    });

    it("passes normalized contact data to email delivery", async () => {
        await submit(createValidSubmission({
            name: "   Camden   ",
            email: "  camden@example.com  ",
            subject: "  Employment opportunity  ",
            message: "  Hello from the contact form.  "
        }));

        expect(mockedSendContactEmail).toHaveBeenCalledOnce();

        expect(mockedSendContactEmail).toHaveBeenCalledWith(
            {
                name: "Camden",
                email: "camden@example.com",
                subject: "Employment opportunity",
                message: "Hello from the contact form."
            },
            TEST_RESEND_KEY
        );
    });

    it("accepts a valid freeform subject", async () => {
        const response = await submit(createValidSubmission({
            subject: "Question about your embedded systems work"
        }));

        expect(response.status).toBe(200);
        expect(mockedSendContactEmail).toHaveBeenCalledOnce();
    });

    it("invokes email delivery once for a valid submission", async () => {
        await submit(createValidSubmission());

        expect(mockedSendContactEmail).toHaveBeenCalledOnce();
    });

});

// ============================================================
// CONTENT TYPE VALIDATION
// ============================================================

describe("contact handler - content type", () => {

    it("rejects text/plain with HTTP 415", async () => {
        const response = await invokeHandler(
            createRequest("hello", "POST", "text/plain")
        );

        expect(response.status).toBe(415);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("accepts JSON with a charset parameter", async () => {
        const request = createRequest(
            JSON.stringify(createValidSubmission()),
            "POST",
            "application/json; charset=utf-8"
        );

        const response = await invokeHandler(request);

        expect(response.status).toBe(200);
    });

    it("rejects requests without Content-Type", async () => {
        const request = new Request(API_URL, {
            method: "POST"
        });

        const response = await invokeHandler(request);

        expect(response.status).toBe(415);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

});

// ============================================================
// REQUEST BODY VALIDATION
// ============================================================

describe("contact handler - request body", () => {

    it("rejects malformed JSON with HTTP 400", async () => {
        const response = await invokeHandler(
            createRequest('{"name":')
        );

        expect(response.status).toBe(400);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("rejects an empty body with HTTP 400", async () => {
        const response = await invokeHandler(
            createRequest("")
        );

        expect(response.status).toBe(400);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("rejects an oversized body with HTTP 413", async () => {
        const response = await invokeHandler(
            createRequest("A".repeat(16 * 1024 + 1))
        );

        expect(response.status).toBe(413);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("rejects malformed UTF-8 with HTTP 400", async () => {
        const request = createRequest(
            new Uint8Array([0xC3, 0x28])
        );

        const response = await invokeHandler(request);

        expect(response.status).toBe(400);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

});

// ============================================================
// CONTACT VALIDATION
// ============================================================

describe("contact handler - contact validation", () => {

    const invalidCases = [
        ["invalid email", { email: "camden@exam!ple.com" }],
        ["short name", { name: "A" }],
        ["short subject", { subject: "Hi" }],
        ["short message", { message: "Short" }],
        ["empty email", { email: "" }],
        ["numeric name", { name: 42 }]
    ] as const;

    it.each(invalidCases)(
        "rejects %s with HTTP 400",
        async (_label, overrides) => {
            const response = await submit(
                createValidSubmission(overrides)
            );

            expect(response.status).toBe(400);
            expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
            expect(mockedSendContactEmail).not.toHaveBeenCalled();
        }
    );

    it("rejects missing contact properties", async () => {
        const { email, ...incomplete } = createValidSubmission();

        const response = await submit(incomplete);

        expect(response.status).toBe(400);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it.each([
        null,
        42,
        [],
        "hello"
    ])("rejects non-object or invalid JSON data: %j", async (data) => {
        const response = await submit(data);

        expect(response.status).toBe(400);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

});

// ============================================================
// TURNSTILE TOKEN VALIDATION
// ============================================================

describe("contact handler - Turnstile tokens", () => {

    it("rejects a missing token with HTTP 403", async () => {
        const { turnstileToken, ...withoutToken } =
            createValidSubmission();

        const response = await submit(withoutToken);

        expect(response.status).toBe(403);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it.each([
        "",
        null,
        undefined,
        42,
        true,
        {},
        [],
        "A".repeat(2049)
    ])("rejects invalid token values: %j", async (token) => {
        const response = await submit(createValidSubmission({
            turnstileToken: token
        }));

        expect(response.status).toBe(403);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("passes a 2048-character token to verification", async () => {
        const token = "A".repeat(2048);

        const response = await submit(createValidSubmission({
            turnstileToken: token
        }));

        expect(response.status).toBe(200);
        expect(mockedVerifyTurnstile).toHaveBeenCalledWith(
            token,
            TEST_TURNSTILE_SECRET,
            TEST_HOSTNAME
        );
    });

    it("does not send email when Turnstile rejects the token", async () => {
        mockedVerifyTurnstile.mockResolvedValue(false);

        const response = await submit(createValidSubmission());

        expect(response.status).toBe(403);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();

        const body = await readApiResponse(response);
        expect(body.success).toBe(false);
    });

    it("does not send email when Turnstile throws", async () => {
        mockedVerifyTurnstile.mockRejectedValue(
            new Error("Verification service unavailable")
        );

        const response = await submit(createValidSubmission());

        expect(response.status).toBe(500);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

});

// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================

describe("contact handler - environment", () => {

    it("returns HTTP 503 when Turnstile secret is missing", async () => {
        const response = await submit(
            createValidSubmission(),
            { RESEND_API_KEY: TEST_RESEND_KEY }
        );

        expect(response.status).toBe(503);
        expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("returns HTTP 503 when Turnstile secret is empty", async () => {
        const response = await submit(
            createValidSubmission(),
            {
                TURNSTILE_SECRET_KEY: "",
                RESEND_API_KEY: TEST_RESEND_KEY
            }
        );

        expect(response.status).toBe(503);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("returns HTTP 503 when Resend key is missing", async () => {
        const response = await submit(
            createValidSubmission(),
            {
                TURNSTILE_SECRET_KEY: TEST_TURNSTILE_SECRET,
                TURNSTILE_EXPECTED_HOSTNAME: TEST_HOSTNAME
            }
        );

        expect(response.status).toBe(503);
        expect(mockedVerifyTurnstile).toHaveBeenCalledOnce();
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

    it("returns HTTP 503 when Resend key is empty", async () => {
        const response = await submit(
            createValidSubmission(),
            {
                TURNSTILE_SECRET_KEY: TEST_TURNSTILE_SECRET,
                RESEND_API_KEY: ""
            }
        );

        expect(response.status).toBe(503);
        expect(mockedSendContactEmail).not.toHaveBeenCalled();
    });

});

// ============================================================
// EMAIL DELIVERY ERRORS
// ============================================================

describe("contact handler - email delivery", () => {

    it("does not report success when Resend throws", async () => {
        mockedSendContactEmail.mockRejectedValue(
            new Error("Email provider unavailable")
        );

        const response = await submit(createValidSubmission());

        expect(response.status).toBe(500);

        const body = await readApiResponse(response);

        expect(body.success).toBe(false);
        expect(body.message).toBe("Unexpected Error");
    });

    it("does not return HTTP 200 before email completes", async () => {
        let finishSending!: (id: string) => void;

        const pendingEmail = new Promise<string>((resolve) => {
            finishSending = resolve;
        });

        mockedSendContactEmail.mockReturnValue(pendingEmail);

        let handlerFinished = false;

        const handlerPromise = submit(createValidSubmission())
            .then((response) => {
                handlerFinished = true;
                return response;
            });

        // Give the handler an opportunity to reach the email step.
        await vi.waitFor(() => {
            expect(mockedSendContactEmail).toHaveBeenCalledOnce();
        });

        expect(handlerFinished).toBe(false);

        finishSending(TEST_EMAIL_ID);

        const response = await handlerPromise;

        expect(response.status).toBe(200);
        expect(handlerFinished).toBe(true);
    });

    it("does not expose the email provider ID in the response", async () => {
        const response = await submit(createValidSubmission());

        const body = await readApiResponse(response);

        expect(body.success).toBe(true);
        expect(JSON.stringify(body)).not.toContain(TEST_EMAIL_ID);
    });

});

// ============================================================
// HTTP METHOD RESTRICTIONS
// ============================================================

describe("contact handler - HTTP methods", () => {

    async function invokeUnsupportedMethod(): Promise<Response> {
        const context = {} as Parameters<typeof onRequest>[0];

        return await onRequest(context) as Response;
    }

    it("returns HTTP 405 for unsupported methods", async () => {
        const response = await invokeUnsupportedMethod();

        expect(response.status).toBe(405);
    });

    it("includes the Allow: POST header", async () => {
        const response = await invokeUnsupportedMethod();

        expect(response.headers.get("Allow")).toBe("POST");
    });

    it("returns JSON for unsupported methods", async () => {
        const response = await invokeUnsupportedMethod();

        expect(
            response.headers.get("content-type")
        ).toContain("application/json");

        const body = await readApiResponse(response);

        expect(body.success).toBe(false);
        expect(body.message).toBe("Method Not Allowed");
    });

});
