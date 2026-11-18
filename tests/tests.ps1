
# ============================================================
# Contact API - Live HTTP Integration Tests
#
# Requirements:
#   1. Wrangler running at http://localhost:8788
#   2. Official Turnstile test secret configured in .dev.vars
#
# Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\tests.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$BaseUrl = "http://localhost:8788"
$ApiUrl = "$BaseUrl/api/contact"

$TestToken = "XXXX.DUMMY.TOKEN.XXXX"
$InvalidToken = "invalid-turnstile-token"

$Passed = 0
$Failed = 0
$Results = @()

# ============================================================
# HTTP REQUEST HELPER
# ============================================================

function Invoke-TestRequest {
    param(
        [string]$Method = "POST",
        [AllowEmptyString()]
        [string]$Body = "",
        [string]$ContentType = "application/json",
        [bool]$IncludeContentType = $true
    )

    $params = @{
        Uri = $ApiUrl
        Method = $Method
        UseBasicParsing = $true
        ErrorAction = "Stop"
    }

    if ($Method -ne "GET" -and $Method -ne "HEAD") {
        $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($Body)
    }

    if ($IncludeContentType) {
        $params["ContentType"] = $ContentType
    }

    try {
        $response = Invoke-WebRequest @params

        return @{
            Status = [int]$response.StatusCode
            Body = [string]$response.Content
            Headers = $response.Headers
        }
    }
    catch {
        if ($null -eq $_.Exception.Response) {
            throw "Network error: $($_.Exception.Message)"
        }

        $response = $_.Exception.Response
        $status = [int]$response.StatusCode

        $responseBody = ""

        try {
            $stream = $response.GetResponseStream()

            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream)

                try {
                    $responseBody = $reader.ReadToEnd()
                }
                finally {
                    $reader.Dispose()
                }
            }
        }
        catch {
            $responseBody = ""
        }

        return @{
            Status = $status
            Body = $responseBody
            Headers = $response.Headers
        }
    }
}

# ============================================================
# SUBMISSION FACTORY
# ============================================================

function New-ValidSubmission {
    param(
        [hashtable]$Overrides = @{}
    )

    $submission = @{
        name = "Camden"
        email = "camden@example.com"
        subject = "Employment opportunity"
        message = "Hello from the contact form."
        turnstileToken = $TestToken
    }

    foreach ($key in $Overrides.Keys) {
        $submission[$key] = $Overrides[$key]
    }

    return $submission
}

# ============================================================
# TEST RUNNER
# ============================================================

function Test-Api {
    param(
        [string]$Name,
        [int]$ExpectedStatus,
        [object]$Data = $null,
        [string]$RawBody = "",
        [bool]$UseRawBody = $false,
        [string]$Method = "POST",
        [string]$ContentType = "application/json",
        [bool]$IncludeContentType = $true,
        [string]$ExpectedMessage = ""
    )

    $script:Results += $Name

    try {
        if ($UseRawBody) {
            $body = $RawBody
        }
        else {
            $body = ConvertTo-Json -InputObject $Data -Depth 20 -Compress
        }

        $response = Invoke-TestRequest `
            -Method $Method `
            -Body $body `
            -ContentType $ContentType `
            -IncludeContentType $IncludeContentType

        $statusMatches = $response.Status -eq $ExpectedStatus
        $messageMatches = $true

        if ($ExpectedMessage -ne "") {
            try {
                $json = ConvertFrom-Json -InputObject $response.Body
                $messageMatches = $json.message -eq $ExpectedMessage
            }
            catch {
                $messageMatches = $false
            }
        }

        if ($statusMatches -and $messageMatches) {
            $script:Passed++

            Write-Host "[PASS] $Name" -ForegroundColor Green
        }
        else {
            $script:Failed++

            Write-Host "[FAIL] $Name" -ForegroundColor Red
            Write-Host "  Expected HTTP: $ExpectedStatus"
            Write-Host "  Actual HTTP:   $($response.Status)"

            if ($ExpectedMessage -ne "") {
                Write-Host "  Expected message: $ExpectedMessage"
            }

            Write-Host "  Response: $($response.Body)"
        }
    }
    catch {
        $script:Failed++

        Write-Host "[ERROR] $Name" -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)"
    }
}

# ============================================================
# SERVER AVAILABILITY
# ============================================================

Write-Host ""
Write-Host "Contact API Integration Tests" -ForegroundColor Cyan
Write-Host "Endpoint: $ApiUrl"
Write-Host ""

try {
    $null = Invoke-WebRequest `
        -Uri $BaseUrl `
        -UseBasicParsing `
        -TimeoutSec 10

    Write-Host "Wrangler server is reachable." -ForegroundColor Green
}
catch {
    Write-Host "Unable to reach Wrangler at $BaseUrl" -ForegroundColor Red
    Write-Host "Start the server before running these tests."
    exit 1
}

# ============================================================
# SUCCESSFUL SUBMISSIONS
# ============================================================

Write-Host ""
Write-Host "Successful submissions" -ForegroundColor Cyan

Test-Api `
    -Name "Valid submission returns HTTP 200" `
    -ExpectedStatus 200 `
    -Data (New-ValidSubmission)

Test-Api `
    -Name "Valid freeform subject is accepted" `
    -ExpectedStatus 200 `
    -Data (New-ValidSubmission @{
        subject = "Question about embedded systems development"
    })

Test-Api `
    -Name "Whitespace around name is normalized" `
    -ExpectedStatus 200 `
    -Data (New-ValidSubmission @{
        name = "   Camden   "
    }) `
    -ExpectedMessage "Received submission from Camden"

# ============================================================
# CONTACT VALIDATION
# ============================================================

Write-Host ""
Write-Host "Contact field validation" -ForegroundColor Cyan

Test-Api `
    -Name "Invalid email is rejected" `
    -ExpectedStatus 400 `
    -Data (New-ValidSubmission @{
        email = "camden@exam!ple.com"
    })

Test-Api `
    -Name "Missing email is rejected" `
    -ExpectedStatus 400 `
    -Data @{
        name = "Camden"
        subject = "Employment opportunity"
        message = "Hello from the contact form."
        turnstileToken = $TestToken
    }

Test-Api `
    -Name "Short name is rejected" `
    -ExpectedStatus 400 `
    -Data (New-ValidSubmission @{
        name = "A"
    })

Test-Api `
    -Name "Short subject is rejected" `
    -ExpectedStatus 400 `
    -Data (New-ValidSubmission @{
        subject = "Hi"
    })

Test-Api `
    -Name "Short message is rejected" `
    -ExpectedStatus 400 `
    -Data (New-ValidSubmission @{
        message = "Short"
    })

Test-Api `
    -Name "5000-character message is accepted" `
    -ExpectedStatus 200 `
    -Data (New-ValidSubmission @{
        message = "A" * 5000
    })

Test-Api `
    -Name "5001-character message is rejected" `
    -ExpectedStatus 400 `
    -Data (New-ValidSubmission @{
        message = "A" * 5001
    })

# ============================================================
# TURNSTILE VERIFICATION
# ============================================================

Write-Host ""
Write-Host "Turnstile verification" -ForegroundColor Cyan

$missingToken = New-ValidSubmission
$missingToken.Remove("turnstileToken")

Test-Api `
    -Name "Missing Turnstile token returns HTTP 403" `
    -ExpectedStatus 403 `
    -Data $missingToken

Test-Api `
    -Name "Empty Turnstile token returns HTTP 403" `
    -ExpectedStatus 403 `
    -Data (New-ValidSubmission @{
        turnstileToken = ""
    })

Test-Api `
    -Name "Invalid Turnstile token returns HTTP 403" `
    -ExpectedStatus 403 `
    -Data (New-ValidSubmission @{
        turnstileToken = $InvalidToken
    })

Test-Api `
    -Name "Oversized Turnstile token returns HTTP 403" `
    -ExpectedStatus 403 `
    -Data (New-ValidSubmission @{
        turnstileToken = "A" * 2049
    })

# ============================================================
# JSON AND CONTENT-TYPE HANDLING
# ============================================================

Write-Host ""
Write-Host "Request formatting" -ForegroundColor Cyan

Test-Api `
    -Name "Malformed JSON returns HTTP 400" `
    -ExpectedStatus 400 `
    -UseRawBody $true `
    -RawBody '{"name":'

Test-Api `
    -Name "Empty JSON body returns HTTP 400" `
    -ExpectedStatus 400 `
    -UseRawBody $true `
    -RawBody ""

Test-Api `
    -Name "Non-object JSON returns HTTP 400" `
    -ExpectedStatus 400 `
    -UseRawBody $true `
    -RawBody "42"

Test-Api `
    -Name "Unsupported Content-Type returns HTTP 415" `
    -ExpectedStatus 415 `
    -UseRawBody $true `
    -RawBody "Hello World" `
    -ContentType "text/plain"

Test-Api `
    -Name "Missing Content-Type returns HTTP 415" `
    -ExpectedStatus 415 `
    -Data (New-ValidSubmission) `
    -IncludeContentType $false

# ============================================================
# BODY SIZE LIMIT
# ============================================================

Write-Host ""
Write-Host "Request size limits" -ForegroundColor Cyan

Test-Api `
    -Name "Oversized request returns HTTP 413" `
    -ExpectedStatus 413 `
    -UseRawBody $true `
    -RawBody ("A" * (16 * 1024 + 1))

# ============================================================
# HTTP METHOD RESTRICTIONS
# ============================================================

Write-Host ""
Write-Host "HTTP method restrictions" -ForegroundColor Cyan

Test-Api `
    -Name "GET is rejected with HTTP 405" `
    -ExpectedStatus 405 `
    -Method "GET" `
    -UseRawBody $true

# ============================================================
# SUMMARY
# ============================================================

Write-Host ""
Write-Host "=================================================="
Write-Host "Integration Test Results"
Write-Host "=================================================="

Write-Host "Passed: $Passed" -ForegroundColor Green

if ($Failed -gt 0) {
    Write-Host "Failed: $Failed" -ForegroundColor Red
}
else {
    Write-Host "Failed: 0" -ForegroundColor Green
}

Write-Host "Total:  $($Passed + $Failed)"
Write-Host ""

if ($Failed -gt 0) {
    exit 1
}

exit 0
