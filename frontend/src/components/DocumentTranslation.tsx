import React, { useCallback, useState } from "react";
import { useDocumentTranslation } from "../hooks/useDocumentTranslation";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { 
  Upload, 
  FileText, 
  Download, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle,
  Languages,
  Clock,
  FileType,
  Loader2
} from "lucide-react";

export function DocumentTranslation() {
  const [dragActive, setDragActive] = useState(false);
  const {
    state,
    progress,
    result,
    error,
    processDocument,
    downloadTranslation,
    downloadTranslationAsPDF,
    reset,
  } = useDocumentTranslation();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processDocument(e.dataTransfer.files[0]);
    }
  }, [processDocument]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processDocument(e.target.files[0]);
    }
  }, [processDocument]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getLanguageName = (code: string): string => {
    return code === 'en' ? 'English' : code === 'fr' ? 'Franais' : code.toUpperCase();
  };

  const getStateIcon = () => {
    switch (state) {
      case "extracting":
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case "translating":
        return <Languages className="w-5 h-5 text-purple-500 animate-pulse" />;
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStateMessage = () => {
    switch (state) {
      case "extracting":
        return "Extracting text from document...";
      case "translating":
        return "Translating document with AI...";
      case "completed":
        return "Translation completed successfully!";
      case "error":
        return error || "An error occurred during translation";
      default:
        return "Ready to translate documents";
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Document Translation System</h1>
        <p className="text-muted-foreground">
          Professional PDF and TXT document translation with legal specialization
        </p>
      </div>

      {/* Upload Area */}
      {state === "idle" && (
        <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <CardContent className="p-8">
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragActive 
                  ? "border-primary bg-primary/5" 
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Upload Document</h3>
              <p className="text-muted-foreground mb-4">
                Drag and drop your PDF or TXT file here, or click to browse
              </p>
              
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              <Button variant="outline" className="pointer-events-none">
                <FileType className="w-4 h-4 mr-2" />
                Choose File
              </Button>
              
              <div className="mt-4 flex justify-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  PDF Files
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  TXT Files
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Status */}
      {(state === "extracting" || state === "translating") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStateIcon()}
              Processing Document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{getStateMessage()}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Processing...
              </span>
              {state === "translating" && (
                <Badge variant="secondary" className="animate-pulse">
                  <Languages className="w-3 h-3 mr-1" />
                  AI Translation
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {state === "error" && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              Translation Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={reset} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {state === "completed" && result && (
        <div className="space-y-6">
          {/* Success Header */}
          <Card className="border-orange-500/20 bg-black">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-500">
                <CheckCircle className="w-5 h-5" />
                Translation Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-orange-300/70">File:</span>
                  <p className="font-medium truncate text-orange-100">{result.fileName}</p>
                </div>
                <div>
                  <span className="text-orange-300/70">Languages:</span>
                  <p className="font-medium text-orange-100">
                    {getLanguageName(result.sourceLanguage)}  {getLanguageName(result.targetLanguage)}
                  </p>
                </div>
                <div>
                  <span className="text-orange-300/70">Words:</span>
                  <p className="font-medium text-orange-100">{result.wordCount.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-orange-300/70">Time:</span>
                  <p className="font-medium text-orange-100">{Math.round(result.processingTime / 1000)}s</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Download Options */}
          <Card>
            <CardHeader>
              <CardTitle>Download Translation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  onClick={() => downloadTranslationAsPDF(result)}
                  className="h-auto p-4 flex flex-col items-start gap-2 bg-orange-600 hover:bg-orange-700 text-white border-orange-500"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    <span className="font-semibold">Formatted PDF</span>
                  </div>
                  <span className="text-sm opacity-90">
                    Professional layout with preserved formatting
                  </span>
                </Button>
                
                <Button 
                  onClick={() => downloadTranslation(result)}
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2 bg-black border-orange-500 text-orange-100 hover:bg-orange-950 hover:text-orange-50"
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    <span className="font-semibold">Plain Text</span>
                  </div>
                  <span className="text-sm opacity-70">
                    Simple text file with metadata
                  </span>
                </Button>
              </div>
              
              <Separator />
              
              <Button onClick={reset} variant="ghost" className="w-full text-orange-400 hover:text-orange-300 hover:bg-orange-950/50">
                <RotateCcw className="w-4 h-4 mr-2" />
                Translate Another Document
              </Button>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Translation Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge variant="secondary">{getLanguageName(result.sourceLanguage)}</Badge>
                    Original Text
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono">
                      {result.originalText.substring(0, 1000)}
                      {result.originalText.length > 1000 && "..."}
                    </pre>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge variant="default">{getLanguageName(result.targetLanguage)}</Badge>
                    Translated Text
                  </h4>
                  <div className="bg-primary/5 rounded-lg p-4 max-h-96 overflow-y-auto border border-primary/20">
                    <pre className="whitespace-pre-wrap text-sm font-mono">
                      {result.translatedText.substring(0, 1000)}
                      {result.translatedText.length > 1000 && "..."}
                    </pre>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Features */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-lg">Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Languages className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="font-medium">Legal Specialization</p>
                <p className="text-muted-foreground">Proper legal terminology and formatting</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="font-medium">Structure Preservation</p>
                <p className="text-muted-foreground">Maintains document layout and hierarchy</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="font-medium">Professional Output</p>
                <p className="text-muted-foreground">High-quality PDF and text formats</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}