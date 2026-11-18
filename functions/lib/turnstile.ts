
export async function verifyTurnstile(
    token: string,
    secret: string
): Promise<boolean> {
    const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                secret,
                response: token
            })
        }
    );

    if (!response.ok) {
        throw new Error("Turnstile verification service failed");
    }

    const result: { success?: boolean } = await response.json();

    return result.success === true;
}
