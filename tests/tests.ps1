
# ============================================================
# Camden Portfolio Contact API - Regression Test Suite
# Compatible with Windows PowerShell 5.1
#
# Start Wrangler first:
#   npx wrangler pages dev public
#
# Run:
#   powershell -NoProfile -File .\tests\tests.ps1
# ============================================================

Add-Type -AssemblyName System.Net.Http

$ErrorActionPreference = "Stop"

$url = "http://localhost:8788/api/contact"
$utf8 = [System.Text.Encoding]::UTF8
$client = [System.Net.Http.HttpClient]::new()

$valid = @{
    name = "Camden"
    email = "camden@example.com"
    subject = "Employment opportunity"
    message = "Hello, I would like to discuss an engineering position."
}

$tests = [System.Collections.Generic.List[object]]::new()

# ------------------------------------------------------------
# Test registration
# ------------------------------------------------------------

function Add-Case {
    param(
        [string]$Name,
        [int]$Expected,
        [hashtable]$Changes = @{},
        [string]$Method = "POST",
        [AllowNull()][string]$ContentType = "application/json",
        [AllowNull()][string]$RawJson = $null,
        [AllowNull()][byte[]]$RawBytes = $null
    )

    $body = $valid.Clone()

    foreach ($key in $Changes.Keys) {
        $body[$key] = $Changes[$key]
    }

    if ($PSBoundParameters.ContainsKey("RawBytes")) {
        $bytes = $RawBytes
    }
    elseif ($PSBoundParameters.ContainsKey("RawJson")) {
        $bytes = $utf8.GetBytes($RawJson)
    }
    else {
        $json = ConvertTo-Json -InputObject $body -Depth 10 -Compress
        $bytes = $utf8.GetBytes($json)
    }

    $tests.Add([PSCustomObject]@{
        Name = $Name
        Expected = $Expected
        Method = $Method
        ContentType = $ContentType
        Bytes = $bytes
    })
}

# Creates valid JSON with an extra padding field.
# Total encoded body length is exactly TargetBytes.
function New-PaddedBody {
    param([int]$TargetBytes)

    $body = $valid.Clone()
    $body["padding"] = ""

    $base = ConvertTo-Json -InputObject $body -Depth 10 -Compress
    $baseSize = $utf8.GetByteCount($base)

    if ($TargetBytes -lt $baseSize) {
        throw "Target size too small for baseline JSON."
    }

    $body["padding"] = "x" * ($TargetBytes - $baseSize)

    $json = ConvertTo-Json -InputObject $body -Depth 10 -Compress
    $actual = $utf8.GetByteCount($json)

    if ($actual -ne $TargetBytes) {
        throw "Payload construction failed: $actual bytes instead of $TargetBytes."
    }

    return $json
}

# ============================================================
# A. HTTP METHODS - 4 tests
# ============================================================

Add-Case "HTTP 01 Valid POST" 200
Add-Case "HTTP 02 GET rejected" 405 -Method "GET"
Add-Case "HTTP 03 PUT rejected" 405 -Method "PUT"
Add-Case "HTTP 04 DELETE rejected" 405 -Method "DELETE"

# ============================================================
# B. MEDIA TYPES - 11 tests
# ============================================================

Add-Case "MEDIA 01 Standard JSON" 200

Add-Case "MEDIA 02 JSON charset" 200 `
    -ContentType "application/json; charset=utf-8"

Add-Case "MEDIA 03 Uppercase JSON" 200 `
    -ContentType "APPLICATION/JSON"

Add-Case "MEDIA 04 Mixed case" 200 `
    -ContentType "Application/Json"

Add-Case "MEDIA 05 Whitespace parameter" 200 `
    -ContentType "application/json ; charset=utf-8"

Add-Case "MEDIA 06 Plain text" 415 `
    -ContentType "text/plain"

Add-Case "MEDIA 07 Form data" 415 `
    -ContentType "application/x-www-form-urlencoded"

Add-Case "MEDIA 08 XML" 415 `
    -ContentType "application/xml"

Add-Case "MEDIA 09 Missing header" 415 `
    -ContentType $null

Add-Case "MEDIA 10 Problem JSON" 415 `
    -ContentType "application/problem+json"

Add-Case "MEDIA 11 Reject before parsing" 415 `
    -ContentType "text/plain" `
    -RawJson "not valid JSON"

# ============================================================
# C. JSON PARSING - 8 tests
# ============================================================

Add-Case "JSON 01 Malformed syntax" 400 `
    -RawJson '{"name":'

Add-Case "JSON 02 Null body" 400 `
    -RawJson 'null'

Add-Case "JSON 03 Empty object" 400 `
    -RawJson '{}'

Add-Case "JSON 04 Empty array" 400 `
    -RawJson '[]'

Add-Case "JSON 05 String body" 400 `
    -RawJson '"hello"'

Add-Case "JSON 06 Numeric body" 400 `
    -RawJson '42'

Add-Case "JSON 07 Boolean body" 400 `
    -RawJson 'true'

Add-Case "JSON 08 Empty body" 400 `
    -RawJson ''

# ============================================================
# D. STRUCTURAL VALIDATION - 9 tests
# ============================================================

Add-Case "STRUCT 01 Missing name" 400 `
    -RawJson '{"email":"a@b.com","subject":"Test","message":"Hello world"}'

Add-Case "STRUCT 02 Missing email" 400 `
    -RawJson '{"name":"Camden","subject":"Test","message":"Hello world"}'

Add-Case "STRUCT 03 Missing subject" 400 `
    -RawJson '{"name":"Camden","email":"a@b.com","message":"Hello world"}'

Add-Case "STRUCT 04 Missing message" 400 `
    -RawJson '{"name":"Camden","email":"a@b.com","subject":"Test"}'

Add-Case "STRUCT 05 Numeric name" 400 `
    -Changes @{ name = 42 }

Add-Case "STRUCT 06 Null email" 400 `
    -Changes @{ email = $null }

Add-Case "STRUCT 07 Boolean subject" 400 `
    -Changes @{ subject = $true }

Add-Case "STRUCT 08 Array message" 400 `
    -Changes @{ message = @("Hello", "World") }

Add-Case "STRUCT 09 Object name" 400 `
    -Changes @{ name = @{ first = "Camden" } }

# ============================================================
# E. NAME VALIDATION - 8 tests
# ============================================================

Add-Case "NAME 01 Normal" 200

Add-Case "NAME 02 Empty" 400 `
    -Changes @{ name = "" }

Add-Case "NAME 03 Whitespace" 400 `
    -Changes @{ name = "   " }

Add-Case "NAME 04 Too short" 400 `
    -Changes @{ name = "A" }

Add-Case "NAME 05 Minimum 2" 200 `
    -Changes @{ name = "Al" }

Add-Case "NAME 06 Maximum 100" 200 `
    -Changes @{ name = ("A" * 100) }

Add-Case "NAME 07 Over 100" 400 `
    -Changes @{ name = ("A" * 101) }

Add-Case "NAME 08 Surrounding spaces" 200 `
    -Changes @{ name = "  Camden  " }

# ============================================================
# F. SUBJECT VALIDATION - 7 tests
# ============================================================

Add-Case "SUBJECT 01 Normal" 200

Add-Case "SUBJECT 02 Empty" 400 `
    -Changes @{ subject = "" }

Add-Case "SUBJECT 03 Whitespace" 400 `
    -Changes @{ subject = "   " }

Add-Case "SUBJECT 04 Too short" 400 `
    -Changes @{ subject = "Hi" }

Add-Case "SUBJECT 05 Minimum 3" 200 `
    -Changes @{ subject = "Job" }

Add-Case "SUBJECT 06 Maximum 150" 200 `
    -Changes @{ subject = ("S" * 150) }

Add-Case "SUBJECT 07 Over 150" 400 `
    -Changes @{ subject = ("S" * 151) }

# ============================================================
# G. MESSAGE VALIDATION - 7 tests
# ============================================================

Add-Case "MESSAGE 01 Normal" 200

Add-Case "MESSAGE 02 Empty" 400 `
    -Changes @{ message = "" }

Add-Case "MESSAGE 03 Whitespace" 400 `
    -Changes @{ message = "          " }

Add-Case "MESSAGE 04 Too short" 400 `
    -Changes @{ message = "Hello" }

Add-Case "MESSAGE 05 Minimum 10" 200 `
    -Changes @{ message = ("M" * 10) }

Add-Case "MESSAGE 06 Maximum 5000" 200 `
    -Changes @{ message = ("M" * 5000) }

Add-Case "MESSAGE 07 Over 5000" 400 `
    -Changes @{ message = ("M" * 5001) }

# ============================================================
# H. EMAIL VALIDATION - 23 tests
# ============================================================

Add-Case "EMAIL 01 Standard" 200

Add-Case "EMAIL 02 Plus addressing" 200 `
    -Changes @{ email = "camden+jobs@example.com" }

Add-Case "EMAIL 03 Subdomain" 200 `
    -Changes @{ email = "camden@sub.example.com" }

Add-Case "EMAIL 04 Multi-part domain" 200 `
    -Changes @{ email = "camden@example.co.uk" }

Add-Case "EMAIL 05 Uppercase" 200 `
    -Changes @{ email = "Camden@Example.COM" }

Add-Case "EMAIL 06 Surrounding spaces" 200 `
    -Changes @{ email = "  camden@example.com  " }

Add-Case "EMAIL 07 Empty" 400 `
    -Changes @{ email = "" }

Add-Case "EMAIL 08 Missing at sign" 400 `
    -Changes @{ email = "camdenexample.com" }

Add-Case "EMAIL 09 Double at sign" 400 `
    -Changes @{ email = "camden@@example.com" }

Add-Case "EMAIL 10 Missing local" 400 `
    -Changes @{ email = "@example.com" }

Add-Case "EMAIL 11 Missing domain" 400 `
    -Changes @{ email = "camden@" }

Add-Case "EMAIL 12 Domain without dot" 400 `
    -Changes @{ email = "camden@example" }

Add-Case "EMAIL 13 Leading dot" 400 `
    -Changes @{ email = "camden@.com" }

Add-Case "EMAIL 14 Trailing dot" 400 `
    -Changes @{ email = "camden@example." }

Add-Case "EMAIL 15 Double dot" 400 `
    -Changes @{ email = "camden@example..com" }

Add-Case "EMAIL 16 Leading hyphen" 400 `
    -Changes @{ email = "camden@-example.com" }

Add-Case "EMAIL 17 Trailing hyphen" 400 `
    -Changes @{ email = "camden@example-.com" }

Add-Case "EMAIL 18 Internal whitespace" 400 `
    -Changes @{ email = "cam den@example.com" }

Add-Case "EMAIL 19 Tab character" 400 `
    -Changes @{ email = "camden`t@example.com" }

Add-Case "EMAIL 20 Local 64" 200 `
    -Changes @{ email = (("a" * 64) + "@example.com") }

Add-Case "EMAIL 21 Local 65" 400 `
    -Changes @{ email = (("a" * 65) + "@example.com") }

Add-Case "EMAIL 22 Domain label 63" 200 `
    -Changes @{ email = ("camden@" + ("a" * 63) + ".com") }

Add-Case "EMAIL 23 Domain label 64" 400 `
    -Changes @{ email = ("camden@" + ("a" * 64) + ".com") }

# ============================================================
# I. BODY SIZE AND UTF-8 - 9 tests
# ============================================================

Add-Case "SIZE 01 Exactly 16383 bytes" 200 `
    -RawJson (New-PaddedBody 16383)

Add-Case "SIZE 02 Exactly 16384 bytes" 200 `
    -RawJson (New-PaddedBody 16384)

Add-Case "SIZE 03 Exactly 16385 bytes" 413 `
    -RawJson (New-PaddedBody 16385)

Add-Case "SIZE 04 Large body 32768 bytes" 413 `
    -RawJson (New-PaddedBody 32768)

# Unicode text encoded as UTF-8.
$unicodeMessage = "Hello from the portfolio. Caf" +
                  [char]0x00E9 +
                  " - Unicode validation."

Add-Case "UTF8 01 Valid multibyte text" 200 `
    -Changes @{ message = $unicodeMessage }

# Invalid UTF-8: incomplete two-byte sequence.
Add-Case "UTF8 02 Invalid sequence" 400 `
    -RawBytes ([byte[]]@(0xC3, 0x28))

# Invalid UTF-8: incomplete three-byte sequence.
Add-Case "UTF8 03 Truncated sequence" 400 `
    -RawBytes ([byte[]]@(0xE2, 0x82))

# Invalid UTF-8: overlong encoding.
Add-Case "UTF8 04 Overlong encoding" 400 `
    -RawBytes ([byte[]]@(0xC0, 0xAF))

# Oversized JSON containing valid Unicode in the message.
$unicodeBody = $valid.Clone()
$unicodeBody["message"] = $unicodeMessage
$unicodeBody["padding"] = "x" * 20000

Add-Case "UTF8 05 Oversized Unicode JSON" 413 `
    -RawJson (ConvertTo-Json -InputObject $unicodeBody -Compress)

# ============================================================
# EXECUTION
# ============================================================

$results = foreach ($test in $tests) {

    $status = 0
    $responseBody = ""
    $allowHeaderValid = $false
    $method = [System.Net.Http.HttpMethod]::new($test.Method)
    $request = [System.Net.Http.HttpRequestMessage]::new($method, $url)

    try {
        if ($test.Method -ne "GET") {
            $content = [System.Net.Http.ByteArrayContent]::new(
                [byte[]]$test.Bytes
            )

            if ($null -ne $test.ContentType) {
                $content.Headers.TryAddWithoutValidation(
                    "Content-Type",
                    $test.ContentType
                ) | Out-Null
            }

            $request.Content = $content
        }

        $response = $client.SendAsync($request).GetAwaiter().GetResult()

        try {
            $status = [int]$response.StatusCode

            $responseBody = $response.Content.ReadAsStringAsync().
                GetAwaiter().GetResult()

            # Inspect raw response headers to avoid the previous
            # PowerShell / HttpClient Allow-property issue.
            $headerText = $response.Headers.ToString()

            $allowHeaderValid = (
                $headerText -match '(?im)^Allow:\s*POST\s*$'
            )
        }
        finally {
            $response.Dispose()
        }
    }
    catch {
        $responseBody = $_.Exception.Message
    }
    finally {
        $request.Dispose()
    }

    $passed = $status -eq $test.Expected

    if ($test.Expected -eq 405) {
        $passed = $passed -and $allowHeaderValid
    }

    [PSCustomObject]@{
        Test = $test.Name
        Expected = $test.Expected
        Actual = $status
        Result = if ($passed) { "PASS" } else { "FAIL" }
        Details = if ($passed) {
            ""
        }
        elseif ($status -eq 405 -and !$allowHeaderValid) {
            "Missing Allow: POST header"
        }
        else {
            $responseBody
        }
    }
}

$client.Dispose()

# ============================================================
# RESULTS
# ============================================================

$results | Format-Table Test, Expected, Actual, Result -AutoSize

$passedCount = @(
    $results | Where-Object { $_.Result -eq "PASS" }
).Count

$failedCount = @(
    $results | Where-Object { $_.Result -eq "FAIL" }
).Count

Write-Host ""
Write-Host "========================================"
Write-Host "CONTACT API REGRESSION TEST RESULTS"
Write-Host "========================================"
Write-Host "Passed: $passedCount"
Write-Host "Failed: $failedCount"
Write-Host "Total:  $($tests.Count)"
Write-Host "========================================"

if ($failedCount -gt 0) {
    Write-Host ""
    Write-Host "FAILED TESTS:"

    $results |
        Where-Object { $_.Result -eq "FAIL" } |
        Format-Table Test, Expected, Actual, Details -Wrap

    exit 1
}

Write-Host "All tests passed."
exit 0
