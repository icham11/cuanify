'use client';

import { useState } from 'react';

interface ImageAnalysisResult {
  success: boolean;
  imageUrl: string;
  thumbnailUrl: string;
  fileId: string;
  analysis: string;
  analysisType: string;
}

export default function ImageAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [analysisType, setAnalysisType] = useState<string>('general');
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [error, setError] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select an image file');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('analysisType', analysisType);
      if (prompt) {
        formData.append('prompt', prompt);
      }

      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze image');
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">AI Image Analyzer</h2>

        <div className="space-y-4">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>

          {/* Analysis Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Analysis Type
            </label>
            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="general">General Analysis</option>
              <option value="invoice">Invoice</option>
              <option value="receipt">Receipt</option>
              <option value="stock">Stock/Inventory</option>
              <option value="product">Product</option>
            </select>
          </div>

          {/* Custom Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Prompt (Optional)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Add additional instructions for the AI..."
              rows={3}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-black placeholder-gray-400"
            />
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Analyzing...' : 'Analyze Image'}
          </button>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <h3 className="text-xl font-bold">Analysis Results</h3>

          {/* Image Preview */}
          <div className="flex justify-center">
            <img
              src={result.thumbnailUrl}
              alt="Analyzed"
              className="max-w-md rounded-lg shadow-md"
            />
          </div>

          {/* Analysis Text */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">AI Analysis:</h4>
            <div className="whitespace-pre-wrap text-gray-700">
              {result.analysis}
            </div>
          </div>

          {/* Metadata */}
          <div className="text-sm text-gray-500">
            <p>Analysis Type: <span className="font-medium">{result.analysisType}</span></p>
            <p>File ID: <span className="font-medium">{result.fileId}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}

