document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href]').forEach(link => {
        const url = new URL(link.href, window.location.href);

        if (
            ['http:', 'https:'].includes(url.protocol) &&
            url.origin !== window.location.origin
        ) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
});
