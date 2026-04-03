#!/bin/bash

# NeuralEcho Deployment Script
# This script helps verify your deployment is ready

echo "🚀 NeuralEcho Deployment Verification"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -f "PRODUCTION_READY.md" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "✅ Project structure verified"
echo ""

# Check backend files
echo "📦 Checking Backend..."
if [ -f "backend/package.json" ] && [ -f "backend/index.js" ] && [ -f "backend/render.yaml" ]; then
    echo "  ✅ Backend files present"
else
    echo "  ❌ Backend files missing"
    exit 1
fi

# Check frontend files
echo "📦 Checking Frontend..."
if [ -f "frontend/package.json" ] && [ -f "frontend/vercel.json" ]; then
    echo "  ✅ Frontend files present"
else
    echo "  ❌ Frontend files missing"
    exit 1
fi

# Check environment files
echo "📦 Checking Environment Templates..."
if [ -f "backend/.env.example" ] && [ -f "frontend/.env.example" ] && [ -f "frontend/.env.production" ]; then
    echo "  ✅ Environment templates present"
else
    echo "  ❌ Environment templates missing"
    exit 1
fi

# Check gitignore
echo "📦 Checking .gitignore..."
if grep -q ".env" .gitignore; then
    echo "  ✅ .gitignore configured"
else
    echo "  ⚠️  Warning: .env not in .gitignore"
fi

echo ""
echo "======================================"
echo "✅ All checks passed!"
echo ""
echo "📋 Next Steps:"
echo "1. Commit and push to GitHub"
echo "2. Deploy backend to Render"
echo "3. Deploy frontend to Vercel"
echo "4. Add environment variables in both platforms"
echo "5. Test the deployed application"
echo ""
echo "📚 See PRODUCTION_READY.md for detailed instructions"
echo "======================================"
