import React, { useState } from 'react';
import { useData } from '@/lib/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Mic, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function FoodLog() {
  const { foodEntries, addFood } = useData();
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const handleAnalyze = () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    
    // Simulate AI delay
    setTimeout(() => {
      setIsAnalyzing(false);
      // Mock AI Result
      setAnalysisResult({
        foods_detected: [
          { name: 'Grilled Salmon', portion: '6oz' },
          { name: 'Avocado', portion: '1/2 medium' },
          { name: 'Mixed Greens', portion: '2 cups' }
        ],
        macros: {
          calories: 520,
          protein: 42,
          carbs: 12,
          fat: 34
        },
        qualityScore: 95,
        notes: "Excellent meal! High in Omega-3s and fiber. This will support stable glucose levels.",
        flags: ["high_protein", "healthy_fats"]
      });
    }, 2000);
  };

  const handleSave = () => {
    if (!analysisResult) return;
    addFood({
      text: input,
      timestamp: new Date(),
      macros: analysisResult.macros,
      qualityScore: analysisResult.qualityScore,
      notes: analysisResult.notes
    });
    setInput('');
    setAnalysisResult(null);
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-heading font-bold">Food Log</h1>
        <p className="text-muted-foreground">Snap a photo or describe your meal.</p>
      </div>

      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 space-y-4">
            <Textarea 
              placeholder="e.g. 2 eggs, 1 slice sourdough toast, black coffee..." 
              className="resize-none min-h-[100px] text-lg bg-transparent border-none focus-visible:ring-0 p-0 placeholder:text-muted-foreground/50"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary">
                  <Camera className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary">
                  <Mic className="w-5 h-5" />
                </Button>
              </div>
              <Button 
                onClick={handleAnalyze} 
                disabled={!input.trim() || isAnalyzing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Log Meal'
                )}
              </Button>
            </div>
          </div>

          {/* AI Result Preview */}
          {analysisResult && (
            <div className="bg-secondary/10 p-4 border-t border-secondary/20 animate-in slide-in-from-top-4 fade-in duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                    Score: {analysisResult.qualityScore}/100
                  </div>
                  {analysisResult.flags.map((flag: string) => (
                    <span key={flag} className="text-xs text-muted-foreground bg-background px-2 py-1 rounded border border-border">
                      {flag.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Cals</div>
                  <div className="font-bold">{analysisResult.macros.calories}</div>
                </div>
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Protein</div>
                  <div className="font-bold">{analysisResult.macros.protein}g</div>
                </div>
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Carbs</div>
                  <div className="font-bold">{analysisResult.macros.carbs}g</div>
                </div>
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Fat</div>
                  <div className="font-bold">{analysisResult.macros.fat}g</div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground italic mb-4">
                "{analysisResult.notes}"
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAnalysisResult(null)}>Edit</Button>
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Confirm Log
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="font-heading font-semibold text-lg">Recent Meals</h3>
        {foodEntries.map((entry) => (
          <Card key={entry.id} className="border-none shadow-sm">
            <CardContent className="p-4 flex gap-4">
              <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
                entry.qualityScore >= 90 ? "bg-green-100 text-green-700" :
                entry.qualityScore >= 70 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              )}>
                {entry.qualityScore}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <p className="font-medium truncate">{entry.text}</p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(entry.timestamp, 'h:mm a')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {entry.notes}
                </p>
                <div className="flex gap-3 mt-2 text-xs font-medium text-muted-foreground">
                  <span>{entry.macros.protein}g P</span>
                  <span>{entry.macros.carbs}g C</span>
                  <span>{entry.macros.fat}g F</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
