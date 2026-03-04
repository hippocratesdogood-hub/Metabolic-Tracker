import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { Loader2, CheckCircle2, AlertCircle, ScanBarcode, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ScannedFoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
  _baseCal: number;
  _basePro: number;
  _baseFat: number;
  _baseTotalCarbs: number;
  _baseFiber: number;
  _baseNetCarbs: number;
  confidence: number;
  source: 'verified' | 'ai_estimate';
  sourceName: string | null;
  brand: string | null;
}

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemFound: (item: ScannedFoodItem) => void;
}

type ScanState = 'scanning' | 'looking_up' | 'found' | 'not_found' | 'error' | 'no_camera';

export default function BarcodeScannerModal({ isOpen, onClose, onItemFound }: BarcodeScannerModalProps) {
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);
  const [foundItem, setFoundItem] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [addedCount, setAddedCount] = useState(0);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING, State 3 = PAUSED
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      try {
        scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors
      }
      scannerRef.current = null;
    }
    isInitializedRef.current = false;
  }, []);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || isInitializedRef.current) return;

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      // Clean up previous instance if exists
      if (scannerRef.current) {
        await stopScanner();
      }

      // Only scan product barcodes (UPC/EAN) — ignore QR codes, Code 128,
      // Code 39, etc. that appear on packaging as lot/internal codes.
      const scanner = new Html5Qrcode('barcode-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
        ],
      });
      scannerRef.current = scanner;
      isInitializedRef.current = true;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.5,
        },
        async (decodedText) => {
          // Pause scanner while looking up
          try {
            await scanner.pause(true);
          } catch {
            // Ignore if already paused
          }
          handleBarcodeScan(decodedText);
        },
        () => {
          // QR code scan failure — ignore (expected when nothing in view)
        },
      );

      setScanState('scanning');
    } catch (err: any) {
      console.error('[BarcodeScanner] Failed to start:', err);
      if (err?.message?.includes('NotAllowedError') || err?.message?.includes('Permission')) {
        setScanState('no_camera');
        setErrorMessage('Camera access was denied. Please allow camera access in your browser settings and try again.');
      } else if (err?.name === 'NotAllowedError') {
        setScanState('no_camera');
        setErrorMessage('Camera access was denied. Please allow camera access in your browser settings and try again.');
      } else {
        setScanState('error');
        setErrorMessage('Could not start camera. Please make sure no other app is using it.');
      }
    }
  }, [stopScanner]);

  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode) return;

    setLastBarcode(barcode);
    setScanState('looking_up');
    setFoundItem(null);

    try {
      const result = await api.lookupBarcode(barcode);

      if (result.found && result.item) {
        setScanState('found');
        setFoundItem(result.item);
      } else {
        setScanState('not_found');
      }
    } catch (err: any) {
      console.error('[BarcodeScanner] Lookup error:', err);
      setScanState('error');
      setErrorMessage(err.message || 'Failed to look up barcode');
    }
  };

  const handleAddItem = () => {
    if (!foundItem) return;

    const item: ScannedFoodItem = {
      id: `scan-${Date.now()}-${addedCount}`,
      name: foundItem.name,
      quantity: foundItem.quantity,
      unit: foundItem.unit,
      calories: foundItem.calories,
      protein: foundItem.protein,
      fat: foundItem.fat,
      totalCarbs: foundItem.totalCarbs,
      fiber: foundItem.fiber,
      netCarbs: foundItem.netCarbs,
      _baseCal: foundItem.calories,
      _basePro: foundItem.protein,
      _baseFat: foundItem.fat,
      _baseTotalCarbs: foundItem.totalCarbs,
      _baseFiber: foundItem.fiber,
      _baseNetCarbs: foundItem.netCarbs,
      confidence: foundItem.confidence,
      source: foundItem.source,
      sourceName: foundItem.sourceName,
      brand: foundItem.brand,
    };

    onItemFound(item);
    setAddedCount(prev => prev + 1);
    handleScanAnother();
  };

  const handleScanAnother = async () => {
    setScanState('scanning');
    setFoundItem(null);
    setLastBarcode(null);
    setErrorMessage('');

    // Resume scanner
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 3) { // PAUSED
          await scannerRef.current.resume();
        }
      } catch {
        // If resume fails, try restarting
        await stopScanner();
        await startScanner();
      }
    } else {
      await startScanner();
    }
  };

  const handleClose = () => {
    setAddedCount(0);
    setScanState('scanning');
    setFoundItem(null);
    setLastBarcode(null);
    setErrorMessage('');
    onClose();
  };

  // Start/stop scanner when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Small delay to let the dialog render the container
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading text-center flex items-center justify-center gap-2">
            <ScanBarcode className="w-5 h-5" />
            Scan Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Added count badge */}
          {addedCount > 0 && (
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {addedCount} item{addedCount !== 1 ? 's' : ''} added
              </span>
            </div>
          )}

          {/* Camera viewfinder */}
          {(scanState === 'scanning' || scanState === 'looking_up') && (
            <div className="relative rounded-lg overflow-hidden bg-black">
              <div id="barcode-reader" ref={containerRef} className="w-full" />
              {scanState === 'looking_up' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Looking up barcode...</p>
                    <p className="text-xs text-white/60 mt-1">{lastBarcode}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No camera permission */}
          {scanState === 'no_camera' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* General error */}
          {scanState === 'error' && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={handleScanAnother}>
                Try Again
              </Button>
            </div>
          )}

          {/* Product found */}
          {scanState === 'found' && foundItem && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-900">{foundItem.name}</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Serving: {foundItem.servingSize} | Verified via Open Food Facts
                    </p>
                  </div>
                </div>

                {/* Macros grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/60 rounded p-2">
                    <div className="text-lg font-bold">{foundItem.calories}</div>
                    <div className="text-xs text-muted-foreground">Calories</div>
                  </div>
                  <div className="bg-white/60 rounded p-2">
                    <div className="text-lg font-bold">{foundItem.protein}g</div>
                    <div className="text-xs text-muted-foreground">Protein</div>
                  </div>
                  <div className="bg-white/60 rounded p-2">
                    <div className="text-lg font-bold">{foundItem.fat}g</div>
                    <div className="text-xs text-muted-foreground">Fat</div>
                  </div>
                  <div className="bg-white/60 rounded p-2">
                    <div className="text-lg font-bold">{foundItem.totalCarbs}g</div>
                    <div className="text-xs text-muted-foreground">Carbs</div>
                  </div>
                  <div className="bg-white/60 rounded p-2">
                    <div className="text-lg font-bold">{foundItem.fiber}g</div>
                    <div className="text-xs text-muted-foreground">Fiber</div>
                  </div>
                  <div className="bg-white/60 rounded p-2">
                    <div className="text-lg font-bold">{foundItem.netCarbs}g</div>
                    <div className="text-xs text-muted-foreground">Net Carbs</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleScanAnother}>
                  Scan Another
                </Button>
                <Button className="flex-1" onClick={handleAddItem}>
                  Add Item
                </Button>
              </div>
            </div>
          )}

          {/* Product not found */}
          {scanState === 'not_found' && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <div>
                <p className="font-medium">Product not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Barcode: {lastBarcode}
                </p>
                <p className="text-sm text-muted-foreground">
                  Try entering it manually instead.
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={handleScanAnother}>
                  Scan Another
                </Button>
                <Button size="sm" onClick={handleClose}>
                  Enter Manually
                </Button>
              </div>
            </div>
          )}

          {/* Close button (always visible at bottom) */}
          {(scanState === 'scanning' || scanState === 'looking_up') && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={handleClose}>
                {addedCount > 0 ? 'Done Scanning' : 'Cancel'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
