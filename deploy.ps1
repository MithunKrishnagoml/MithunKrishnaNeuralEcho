# NeuralEcho Deployment Verification Script (PowerShell)
# Run this script to verify your deployment is ready

Write-Host "🚀 NeuralEcho Deployment Verification" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "PRODUCTION_READY.md")) {
    Write-Host "❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Project structure verified" -ForegroundColor Green
Write-Host ""

# Check backend files
Write-Host "📦 Checking Backend..." -ForegroundColor Yellow
if ((Test-Path "backend/package.json") -and (Test-Path "backend/index.js") -and (Test-Path "backend/render.yaml")) {
    Write-Host "  ✅ Backend files present" -ForegroundColor Green
} else {
    Write-Host "  ❌ Backend files missing" -ForegroundColor Red
    exit 1
}

# Check frontend files
Write-Host "📦 Checking Frontend..." -ForegroundColor Yellow
if ((Test-Path "frontend/package.json") -and (Test-Path "frontend/vercel.json")) {
    Write-Host "  ✅ Frontend files present" -ForegroundColor Green
} else {
    Write-Host "  ❌ Frontend files missing" -ForegroundColor Red
    exit 1
}

# Check environment files
Write-Host "📦 Checking Environment Templates..." -ForegroundColor Yellow
if ((Test-Path "backend/.env.example") -and (Test-Path "frontend/.env.example") -and (Test-Path "frontend/.env.production")) {
    Write-Host "  ✅ Environment templates present" -ForegroundColor Green
} else {
    Write-Host "  ❌ Environment templates missing" -ForegroundColor Red
    exit 1
}

# Check gitignore
Write-Host "📦 Checking .gitignore..." -ForegroundColor Yellow
if (Select-String -Path ".gitignore" -Pattern ".env" -Quiet) {
    Write-Host "  ✅ .gitignore configured" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Warning: .env not in .gitignore" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ All checks passed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Commit and push to GitHub"
Write-Host "2. Deploy backend to Render"
Write-Host "3. Deploy frontend to Vercel"
Write-Host "4. Add environment variables in both platforms"
Write-Host "5. Test the deployed application"
Write-Host ""
Write-Host "📚 See PRODUCTION_READY.md for detailed instructions" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Cyan
