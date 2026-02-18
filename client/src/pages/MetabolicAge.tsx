import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  Heart,
  Ruler,
  Droplets,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calculator,
  RotateCcw,
  Info,
  Minus,
} from "lucide-react";
import {
  calculatorFormSchema,
  calculateMetabolicAge,
  getInputWarnings,
  markerEducation,
  type FormValues,
  type CalculatorResult,
  type InterpretationBand,
} from "@/lib/metabolicAgeCalculator";

// --- Band color mapping ---

const bandColors: Record<InterpretationBand, { bg: string; text: string; border: string }> = {
  Advantage: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  Mild: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  Moderate: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  Advanced: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  Severe: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
};

// --- Marker icon mapping ---

const markerIcons: Record<string, typeof Activity> = {
  "Waist:Height Ratio": Ruler,
  "Fasting Insulin": Droplets,
  "TG:HDL Ratio": Droplets,
  "Fasting Glucose": Droplets,
  "Resting Heart Rate": Heart,
  "Systolic BP": Activity,
};

// --- MarkerCard component ---

function MarkerCard({ name, displayValue, points, maxPoints }: { name: string; displayValue: string; points: number; maxPoints: number }) {
  const Icon = markerIcons[name] || Activity;
  const percentage = (points / maxPoints) * 100;
  const education = markerEducation[name];

  const getScoreColor = (pts: number) => {
    if (pts === 0) return "text-emerald-600 dark:text-emerald-400";
    if (pts <= 5) return "text-blue-600 dark:text-blue-400";
    if (pts <= 10) return "text-amber-600 dark:text-amber-400";
    if (pts <= 15) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (pts: number) => {
    if (pts === 0) return "[&>div]:bg-emerald-500";
    if (pts <= 5) return "[&>div]:bg-blue-500";
    if (pts <= 10) return "[&>div]:bg-amber-500";
    if (pts <= 15) return "[&>div]:bg-orange-500";
    return "[&>div]:bg-red-500";
  };

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">{name}</span>
            {education && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3">
                  <p className="text-xs font-medium mb-1">{education.description}</p>
                  <p className="text-xs text-muted-foreground"><strong>To improve:</strong> {education.improvement}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <span className={`text-lg font-bold ${getScoreColor(points)}`}>
            {points}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{displayValue}</p>
        <Progress
          value={percentage}
          className={`h-1.5 ${getProgressColor(points)}`}
        />
      </CardContent>
    </Card>
  );
}

// --- ResultsPanel component ---

function ResultsPanel({ result, onReset }: { result: CalculatorResult; onReset: () => void }) {
  const bandStyle = bandColors[result.interpretationBand];
  const isYounger = result.deltaAge < 0;
  const isOlder = result.deltaAge > 0;
  const DeltaIcon = isYounger ? TrendingDown : isOlder ? TrendingUp : Minus;

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      {/* Hero result */}
      <Card className={`${bandStyle.bg} ${bandStyle.border} border`}>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground mb-2">Your Metabolic Age</p>
          <div className="flex items-baseline justify-center gap-2 mb-4">
            <span className={`text-6xl font-bold ${bandStyle.text}`}>
              {result.metabolicAge.toFixed(1)}
            </span>
            <span className="text-xl text-muted-foreground">years</span>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
            <DeltaIcon className={`h-5 w-5 ${isYounger ? "text-emerald-600 dark:text-emerald-400" : isOlder ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
            <span className={`font-semibold ${isYounger ? "text-emerald-600 dark:text-emerald-400" : isOlder ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              {isYounger ? `${Math.abs(result.deltaAge).toFixed(1)} years younger` : isOlder ? `${result.deltaAge.toFixed(1)} years older` : "Same as calendar age"}
            </span>
            <span className="text-muted-foreground">than your calendar age ({result.calendarAge})</span>
          </div>

          <Badge
            variant="outline"
            className={`${bandStyle.bg} ${bandStyle.text} ${bandStyle.border} text-sm px-4 py-1`}
          >
            {result.interpretationBand} Metabolic Health
          </Badge>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Total Score</p>
            <p className="text-3xl font-bold">{result.totalScore}</p>
            <p className="text-xs text-muted-foreground mt-1">out of 150</p>
            <Progress
              value={(result.totalScore / 150) * 100}
              className="h-2 mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Waist:Height Ratio</p>
            <p className="text-3xl font-bold">{result.waistHeightRatio.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Target: &lt; 0.50</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">TG:HDL Ratio</p>
            <p className="text-3xl font-bold">{result.tgHdlRatio.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Target: &lt; 1.0</p>
          </CardContent>
        </Card>
      </div>

      {/* Score breakdown */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Score Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.markerScores.map((marker) => (
            <MarkerCard
              key={marker.name}
              name={marker.name}
              displayValue={marker.displayValue}
              points={marker.points}
              maxPoints={marker.maxPoints}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3 pt-4">
        <Button
          variant="ghost"
          onClick={onReset}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Calculate Again
        </Button>
      </div>

      {/* Disclaimer */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong>Disclaimer:</strong> This calculator is for educational purposes only and should not be considered medical advice.
              Please consult with a healthcare professional for personalized health assessments and recommendations.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- InputField component ---

function InputField({
  label,
  name,
  placeholder,
  unit,
  unitOptions,
  unitName,
  form,
  icon: Icon,
  tooltip,
}: {
  label: string;
  name: keyof FormValues;
  placeholder: string;
  unit?: string;
  unitOptions?: { value: string; label: string }[];
  unitName?: keyof FormValues;
  form: ReturnType<typeof useForm<FormValues>>;
  icon?: typeof Activity;
  tooltip?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center gap-2">
            <FormLabel className="text-sm font-medium">
              {label}
              <span className="text-destructive ml-0.5">*</span>
            </FormLabel>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex gap-2">
            <FormControl>
              <div className="relative flex-1">
                {Icon && (
                  <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  step="any"
                  placeholder={placeholder}
                  className={Icon ? "pl-10" : ""}
                  {...field}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                />
              </div>
            </FormControl>
            {unit && !unitOptions && (
              <div className="flex items-center px-3 bg-muted rounded-md text-sm text-muted-foreground min-w-[60px] justify-center">
                {unit}
              </div>
            )}
            {unitOptions && unitName && (
              <FormField
                control={form.control}
                name={unitName}
                render={({ field: unitField }) => (
                  <FormItem>
                    <Select
                      value={unitField.value as string}
                      onValueChange={unitField.onChange}
                    >
                      <SelectTrigger className="w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unitOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            )}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// --- Main Page ---

export default function MetabolicAge() {
  const { user } = useAuth();
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const defaultLengthUnit = user?.unitsPreference === 'Metric' ? 'cm' : 'in';

  const form = useForm<FormValues>({
    resolver: zodResolver(calculatorFormSchema),
    defaultValues: {
      calendarAgeYears: "" as unknown as number,
      waistValue: "" as unknown as number,
      waistUnit: defaultLengthUnit,
      heightValue: "" as unknown as number,
      heightUnit: defaultLengthUnit,
      fastingInsulin: "" as unknown as number,
      triglyceridesValue: "" as unknown as number,
      triglyceridesUnit: "mg/dL",
      hdlValue: "" as unknown as number,
      hdlUnit: "mg/dL",
      fastingGlucose: "" as unknown as number,
      restingHeartRate: "" as unknown as number,
      systolicBP: "" as unknown as number,
    },
  });

  const watchedValues = form.watch();
  const warnings = useMemo(() => {
    const values: Record<string, unknown> = {};
    if (watchedValues.waistValue) values.waistValue = Number(watchedValues.waistValue);
    if (watchedValues.waistUnit) values.waistUnit = watchedValues.waistUnit;
    if (watchedValues.heightValue) values.heightValue = Number(watchedValues.heightValue);
    if (watchedValues.heightUnit) values.heightUnit = watchedValues.heightUnit;
    if (watchedValues.fastingInsulin) values.fastingInsulin = Number(watchedValues.fastingInsulin);
    if (watchedValues.triglyceridesValue) values.triglyceridesValue = Number(watchedValues.triglyceridesValue);
    if (watchedValues.triglyceridesUnit) values.triglyceridesUnit = watchedValues.triglyceridesUnit;
    if (watchedValues.hdlValue) values.hdlValue = Number(watchedValues.hdlValue);
    if (watchedValues.hdlUnit) values.hdlUnit = watchedValues.hdlUnit;
    if (watchedValues.fastingGlucose) values.fastingGlucose = Number(watchedValues.fastingGlucose);
    if (watchedValues.restingHeartRate) values.restingHeartRate = Number(watchedValues.restingHeartRate);
    if (watchedValues.systolicBP) values.systolicBP = Number(watchedValues.systolicBP);
    return getInputWarnings(values as any);
  }, [watchedValues]);

  const onSubmit = (data: FormValues) => {
    const calcResult = calculateMetabolicAge({
      calendarAgeYears: Number(data.calendarAgeYears),
      waistValue: Number(data.waistValue),
      waistUnit: data.waistUnit,
      heightValue: Number(data.heightValue),
      heightUnit: data.heightUnit,
      fastingInsulin: Number(data.fastingInsulin),
      triglyceridesValue: Number(data.triglyceridesValue),
      triglyceridesUnit: data.triglyceridesUnit,
      hdlValue: Number(data.hdlValue),
      hdlUnit: data.hdlUnit,
      fastingGlucose: Number(data.fastingGlucose),
      restingHeartRate: Number(data.restingHeartRate),
      systolicBP: Number(data.systolicBP),
    });
    setResult(calcResult);
  };

  const handleReset = () => {
    setResult(null);
    form.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6 pb-20" data-testid="page-metabolic-age">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
          <Calculator className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-heading font-bold mb-2">
          Metabolic Age Calculator
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
          Discover your biological age based on 6 key metabolic health markers.
          Your metabolic age reflects how well your body is functioning compared to your chronological age.
        </p>
      </div>

      {result ? (
        <ResultsPanel result={result} onReset={handleReset} />
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InputField
                  label="Calendar Age"
                  name="calendarAgeYears"
                  placeholder="Enter your age"
                  unit="years"
                  form={form}
                  tooltip="Your chronological age in years. This serves as the baseline for calculating your metabolic age."
                />
              </CardContent>
            </Card>

            {/* Body Measurements */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Ruler className="h-5 w-5 text-primary" />
                  Body Measurements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputField
                    label="Waist Circumference"
                    name="waistValue"
                    placeholder="Enter measurement"
                    unitOptions={[
                      { value: "in", label: "in" },
                      { value: "cm", label: "cm" },
                    ]}
                    unitName="waistUnit"
                    form={form}
                    icon={Ruler}
                    tooltip="Measure around your waist at belly button level. A lower waist-to-height ratio indicates better metabolic health."
                  />
                  <InputField
                    label="Height"
                    name="heightValue"
                    placeholder="Enter height"
                    unitOptions={[
                      { value: "in", label: "in" },
                      { value: "cm", label: "cm" },
                    ]}
                    unitName="heightUnit"
                    form={form}
                    icon={Ruler}
                    tooltip="Your standing height without shoes. Used to calculate your waist-to-height ratio."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Metabolic Markers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Droplets className="h-5 w-5 text-primary" />
                  Metabolic Markers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <InputField
                  label="Fasting Insulin"
                  name="fastingInsulin"
                  placeholder="Enter value"
                  unit={"\u00B5IU/mL"}
                  form={form}
                  icon={Droplets}
                  tooltip="Measures how much insulin your body produces when fasting. Optimal: 5 or less. High levels suggest insulin resistance."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputField
                    label="Triglycerides"
                    name="triglyceridesValue"
                    placeholder="Enter value"
                    unitOptions={[
                      { value: "mg/dL", label: "mg/dL" },
                      { value: "mmol/L", label: "mmol/L" },
                    ]}
                    unitName="triglyceridesUnit"
                    form={form}
                    icon={Droplets}
                    tooltip="Fat molecules in your blood. Lower is better. To improve: limit sugar and alcohol, eat more omega-3 fatty acids."
                  />
                  <InputField
                    label="HDL Cholesterol"
                    name="hdlValue"
                    placeholder="Enter value"
                    unitOptions={[
                      { value: "mg/dL", label: "mg/dL" },
                      { value: "mmol/L", label: "mmol/L" },
                    ]}
                    unitName="hdlUnit"
                    form={form}
                    icon={Droplets}
                    tooltip="'Good' cholesterol. Higher is better. To improve: exercise, eat healthy fats (olive oil, avocado, nuts)."
                  />
                </div>

                <InputField
                  label="Fasting Glucose"
                  name="fastingGlucose"
                  placeholder="Enter value"
                  unit="mg/dL"
                  form={form}
                  icon={Droplets}
                  tooltip="Blood sugar level after 8-12 hours of fasting. Optimal: 85 or less."
                />
              </CardContent>
            </Card>

            {/* Cardiovascular Markers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  Cardiovascular Markers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputField
                    label="Resting Heart Rate"
                    name="restingHeartRate"
                    placeholder="Enter value"
                    unit="bpm"
                    form={form}
                    icon={Heart}
                    tooltip="Heart rate when fully rested. Lower is generally better. Optimal: 58 or less."
                  />
                  <InputField
                    label="Systolic Blood Pressure"
                    name="systolicBP"
                    placeholder="Enter value"
                    unit="mmHg"
                    form={form}
                    icon={Activity}
                    tooltip="The top number in your blood pressure reading. Optimal: below 118."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Warnings */}
            {warnings.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Some values appear unusual
                      </p>
                      <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                        {warnings.map((w, i) => (
                          <li key={i}>{w.message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <Button
                type="submit"
                size="lg"
                className="gap-2 min-w-[200px]"
              >
                <Calculator className="h-5 w-5" />
                Calculate Metabolic Age
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => form.reset()}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Clear Form
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
