const form = document.getElementById("contact-form");
const status = document.getElementById("contact-status");
const submitButton = form.querySelector('button[type="submit"]');

let submittedSuccessfully = false;

let lastSubmissionTime = 0;
const SUBMISSION_COOLDOWN_MS = 3000;

form.addEventListener("submit", async (event) => {

    event.preventDefault();

    const now = Date.now();

    if (
        submitButton.disabled ||
        submittedSuccessfully ||
        now - lastSubmissionTime < SUBMISSION_COOLDOWN_MS
    ) {
        return;
    }

    const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;

    const submission = {
        name: document.getElementById("contact-name").value,
        email: document.getElementById("contact-email").value,
        subject: document.getElementById("contact-subject").value,
        message: document.getElementById("contact-message").value,
        turnstileToken
    };

    if (!turnstileToken) {
        status.textContent = "Please complete the security verification.";
        return;
    }

    lastSubmissionTime = now;

    submitButton.disabled = true;
    status.textContent = "Validating submission...";

    try {
        const response = await fetch("/api/contact", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(submission)
        });

        if (response.ok) {
            submittedSuccessfully = true;
            status.textContent = "Message successfully validated. Email services not connected yet. No message sent.";
            console.log("Submission validated successfully.");
        } else {
            switch (response.status) {
                case 400:
                    status.textContent = "Please check your contact information and message.";
                    break;

                case 403:
                    status.textContent = "Security verification failed. Please try again.";
                    break;

                case 413:
                    status.textContent = "Your message is too large!";
                    break;

                case 415:
                    status.textContent = "Unsupported request format! Please refresh and try again.";
                    break;

                case 429:
                    status.textContent = "Too many submission attempts. Please wait before trying again.";
                    break;

                case 503:
                    status.textContent = "Security verification is temporarily unavailable.";
                    break;

                default:
                    status.textContent = "Something went wrong! Please try again later.";
            }
            window.turnstile?.reset();
            console.error("Submission rejected: ", response.status);
        }
    } catch (error) {
        status.textContent = "Unable to connect to the server! Please try again.";
        window.turnstile?.reset();
        console.error("Network Error: ", error);
    } finally {
        if (!submittedSuccessfully) {
            submitButton.disabled = false;
        }
    }
});