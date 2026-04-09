import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Copy, Download, Share2, AlertCircle, CheckCircle2, RotateCw, Video, Upload, Image as ImageIcon, Sparkles, Loader2 } from "lucide-react";
import { 
  useAdgenGenerate, 
  useAdgenStatus, 
  useAdgenRegenerate 
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

// --- SCHEMA & TYPES ---

const adgenSchema = z.object({
  productName: z.string().min(2, "Product name is required"),
  productCategory: z.enum(["skincare", "supplement", "fashion", "food & beverage", "home", "tech", "other"]),
  productDescription: z.string().min(10, "Description must be at least 10 characters"),
  adAngle: z.enum(["us-vs-them", "before-after", "social-proof"]),
  platform: z.enum(["tiktok", "instagram-reels", "youtube-shorts"]),
  aspectRatio: z.enum(["9:16", "1:1", "4:5"]),
  productImageBase64: z.string().optional(),
  referenceVideoBase64: z.string().optional(),
  creatorAvatarBase64: z.string().optional(),
  hookStyle: z.enum(["question", "bold-statement", "mid-action", "shocking-fact", "i-tried-this"]).optional(),
  voiceoverLanguage: z.enum(["english", "arabic"]).optional(),
  creativeVision: z.string().optional(),
});

type AdgenFormValues = z.infer<typeof adgenSchema>;

const STEPS = [
  "Writing script",
  "Generating voiceover",
  "Generating video scenes",
  "Adding product to scenes",
  "Assembling final video",
  "Done ✓"
];

// --- FILE UPLOAD COMPONENT ---
function FileUploadField({ 
  label, 
  description, 
  accept, 
  icon: Icon, 
  onChange 
}: { 
  label: string; 
  description?: string; 
  accept: string; 
  icon: any; 
  onChange: (base64: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPreview(dataUrl);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      onChange(base64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      
      <div 
        className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        {preview && accept.includes("image") ? (
          <div className="relative w-full aspect-video rounded overflow-hidden">
            <img src={preview} alt="Preview" className="object-cover w-full h-full" />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <p className="text-white text-sm font-medium">Click to replace</p>
            </div>
          </div>
        ) : preview && accept.includes("video") ? (
           <div className="relative w-full aspect-video bg-black rounded flex items-center justify-center overflow-hidden">
             <Video className="w-8 h-8 text-white/50" />
             <div className="absolute inset-0 flex items-center justify-center">
               <p className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded">Video selected</p>
             </div>
           </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium">Click to upload</p>
            <p className="text-xs text-muted-foreground text-center">{accept.replace(/\./g, "").toUpperCase()}</p>
          </>
        )}
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept={accept} 
        onChange={handleFileChange} 
      />
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  
  // App State
  const [appState, setAppState] = useState<"form" | "generating" | "results">("form");
  const [jobId, setJobId] = useState<string | null>(null);
  
  // Mutations & Queries
  const generateMutation = useAdgenGenerate();
  const regenerateMutation = useAdgenRegenerate();
  
  const { data: jobStatus } = useAdgenStatus(
    jobId || "", 
    { 
      query: { 
        enabled: !!jobId && appState === "generating", 
        refetchInterval: 3000 
      } 
    }
  );

  // Status effect listener
  useEffect(() => {
    if (jobStatus) {
      if (jobStatus.status === "done") {
        setAppState("results");
        toast({
          title: "Ad generated successfully!",
          description: "Your video is ready to view.",
        });
      } else if (jobStatus.status === "failed") {
        setAppState("form");
        toast({
          title: "Generation failed",
          description: "There was an error generating your ad. Please try again.",
          variant: "destructive"
        });
      }
    }
  }, [jobStatus, toast]);

  // Form Setup
  const form = useForm<AdgenFormValues>({
    resolver: zodResolver(adgenSchema),
    defaultValues: {
      productName: "",
      productCategory: "skincare",
      productDescription: "",
      adAngle: "us-vs-them",
      platform: "tiktok",
      aspectRatio: "9:16",
      hookStyle: "bold-statement",
      voiceoverLanguage: "english",
      creativeVision: "",
    }
  });

  const onSubmit = (data: AdgenFormValues) => {
    setAppState("generating");
    
    generateMutation.mutate({ data }, {
      onSuccess: (res) => {
        setJobId(res.jobId);
      },
      onError: (err) => {
        setAppState("form");
        toast({
          title: "Error starting job",
          description: "Could not submit your request. Try again.",
          variant: "destructive"
        });
      }
    });
  };

  const handleRegenerate = () => {
    if (!jobId) return;
    setAppState("generating");
    regenerateMutation.mutate(
      { id: jobId },
      {
        onSuccess: (res) => {
          setJobId(res.jobId);
        },
        onError: () => {
          setAppState("results");
          toast({
            title: "Error regenerating",
            description: "Could not restart the job.",
            variant: "destructive"
          });
        }
      }
    );
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Text copied successfully.",
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/30">
      
      {/* HEADER */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight">UGC Studio</span>
          </div>
          {appState === "results" && (
            <Button variant="outline" size="sm" onClick={() => {
              setAppState("form");
              setJobId(null);
            }}>
              Start New
            </Button>
          )}
        </div>
      </header>

      <main className="container max-w-6xl mx-auto py-8 px-4">
        
        {/* === FORM STATE === */}
        {appState === "form" && (
          <div className="grid lg:grid-cols-[1fr_350px] gap-8">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">Create new ad</h1>
                <p className="text-muted-foreground">Configure your product details and creative direction.</p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  
                  {/* Basics */}
                  <div className="space-y-4 bg-card p-6 rounded-xl border border-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">1</div>
                      Product Basics
                    </h2>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="productName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Product Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. GlowSerum" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="productCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="skincare">Skincare</SelectItem>
                                <SelectItem value="supplement">Supplement</SelectItem>
                                <SelectItem value="fashion">Fashion</SelectItem>
                                <SelectItem value="food & beverage">Food & Beverage</SelectItem>
                                <SelectItem value="home">Home</SelectItem>
                                <SelectItem value="tech">Tech</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="productDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description / Key Benefits *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="What does it do? Why is it better? What are the main ingredients?" 
                              className="min-h-[100px] resize-y" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Creative Strategy */}
                  <div className="space-y-4 bg-card p-6 rounded-xl border border-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">2</div>
                      Creative Strategy
                    </h2>
                    
                    <div className="grid md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="adAngle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ad Angle *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="us-vs-them">Us vs Them</SelectItem>
                                <SelectItem value="before-after">Before & After</SelectItem>
                                <SelectItem value="social-proof">Social Proof</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="hookStyle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hook Style</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="bold-statement">Bold Statement</SelectItem>
                                <SelectItem value="question">Question</SelectItem>
                                <SelectItem value="mid-action">Mid-action</SelectItem>
                                <SelectItem value="shocking-fact">Shocking Fact</SelectItem>
                                <SelectItem value="i-tried-this">"I tried this..."</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="voiceoverLanguage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Voiceover</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="english">English</SelectItem>
                                <SelectItem value="arabic">Arabic (Gulf)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="creativeVision"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Instructions (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Any specific visual style, mood, or exact phrases to include?" 
                              className="h-[80px]" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Output Format */}
                  <div className="space-y-4 bg-card p-6 rounded-xl border border-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">3</div>
                      Output Format
                    </h2>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="platform"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Platform *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="tiktok">TikTok</SelectItem>
                                <SelectItem value="instagram-reels">Instagram Reels</SelectItem>
                                <SelectItem value="youtube-shorts">YouTube Shorts</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="aspectRatio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aspect Ratio *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                                <SelectItem value="1:1">1:1 (Square)</SelectItem>
                                <SelectItem value="4:5">4:5 (Portrait)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Hidden form submission button - triggered by the sidebar button */}
                  <button type="submit" id="submit-form-btn" className="hidden" />
                </form>
              </Form>
            </div>

            {/* SIDEBAR */}
            <div className="space-y-6">
              <div className="bg-card p-6 rounded-xl border border-border sticky top-24">
                <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Assets (Optional)</h3>
                
                <div className="space-y-6">
                  <FileUploadField 
                    label="Product Image" 
                    accept="image/*" 
                    icon={ImageIcon}
                    onChange={(b64) => form.setValue("productImageBase64", b64)} 
                  />
                  
                  <FileUploadField 
                    label="Reference Video" 
                    description="Upload a UGC video you like — the AI will match its energy and style."
                    accept="video/*" 
                    icon={Video}
                    onChange={(b64) => form.setValue("referenceVideoBase64", b64)} 
                  />
                  
                  <FileUploadField 
                    label="Creator Avatar" 
                    description="Face for the AI talking head."
                    accept="image/*" 
                    icon={Upload}
                    onChange={(b64) => form.setValue("creatorAvatarBase64", b64)} 
                  />
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <Button 
                    size="lg" 
                    className="w-full text-base font-semibold h-14"
                    onClick={() => document.getElementById("submit-form-btn")?.click()}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                    Generate Ad
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-3">Estimated time: ~2 minutes</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === GENERATING STATE === */}
        {appState === "generating" && (
          <div className="max-w-2xl mx-auto py-20">
            <div className="text-center mb-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-3">Crafting your ad</h2>
              <p className="text-muted-foreground">Our AI director is putting everything together.</p>
            </div>

            <div className="bg-card p-8 rounded-xl border border-border">
              <div className="space-y-8 relative">
                <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-muted z-0"></div>
                
                {STEPS.map((stepName, i) => {
                  // Determine active step logic
                  // If status is running, we use jobStatus.stepIndex.
                  const activeStepIndex = jobStatus?.stepIndex ?? 0;
                  const isCompleted = i < activeStepIndex;
                  const isActive = i === activeStepIndex;
                  
                  return (
                    <div key={i} className={`flex items-center gap-6 relative z-10 transition-opacity duration-500 ${isCompleted || isActive ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 
                        ${isCompleted ? 'bg-primary border-primary text-primary-foreground' : 
                          isActive ? 'bg-background border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]' : 
                          'bg-background border-muted-foreground text-muted-foreground'}
                      `}>
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                      </div>
                      <div>
                        <p className={`font-medium ${isActive ? 'text-primary' : ''}`}>
                          {stepName}
                        </p>
                        {isActive && jobStatus?.currentStep && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {jobStatus.currentStep}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* === RESULTS STATE === */}
        {appState === "results" && jobStatus?.result && (
          <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {jobStatus.audioWarning && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Notice</AlertTitle>
                <AlertDescription>
                  {jobStatus.audioWarning}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Your Ad is Ready</h2>
                <p className="text-muted-foreground mt-1">Review, download, or tweak the results.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
                  <RotateCw className={`w-4 h-4 mr-2 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                  Regenerate
                </Button>
                <Button onClick={() => {
                  if (jobStatus.result?.videoUrl) {
                    window.open(jobStatus.result.videoUrl, '_blank');
                  }
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr_400px] gap-8">
              
              {/* Video Player */}
              <div className="bg-black rounded-2xl overflow-hidden border border-border shadow-2xl relative group flex items-center justify-center min-h-[600px]">
                {jobStatus.result.videoUrl ? (
                  <video 
                    src={jobStatus.result.videoUrl} 
                    className="w-full h-full max-h-[80vh] object-contain"
                    autoPlay 
                    loop 
                    muted 
                    controls
                  />
                ) : (
                  <div className="text-muted-foreground flex flex-col items-center">
                    <Video className="w-12 h-12 mb-4 opacity-50" />
                    <p>Video processing failed or unavailable.</p>
                  </div>
                )}
              </div>

              {/* Copy / Details */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Primary Hook</CardTitle>
                    <CardDescription>The first 3 seconds of text</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-secondary rounded-lg font-medium text-lg leading-snug">
                      "{jobStatus.result.hook}"
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="secondary" className="w-full" onClick={() => handleCopy(jobStatus.result?.hook || "")}>
                      <Copy className="w-4 h-4 mr-2" /> Copy Hook
                    </Button>
                  </CardFooter>
                </Card>

                {jobStatus.result.hookVariants && jobStatus.result.hookVariants.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Alternative Hooks</h3>
                    <div className="flex flex-wrap gap-2">
                      {jobStatus.result.hookVariants.map((variant, i) => (
                        <Badge 
                          key={i} 
                          variant="outline" 
                          className="px-3 py-2 cursor-pointer hover:bg-secondary transition-colors text-sm font-normal"
                          onClick={() => handleCopy(variant)}
                        >
                          {variant}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Caption & Hashtags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {jobStatus.result.caption}
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button variant="secondary" className="w-full" onClick={() => handleCopy(jobStatus.result?.caption || "")}>
                      <Copy className="w-4 h-4 mr-2" /> Copy Caption
                    </Button>
                  </CardFooter>
                </Card>

                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    if (jobStatus.result?.videoUrl) {
                      handleCopy(jobStatus.result.videoUrl);
                    }
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Copy Video URL
                </Button>
              </div>
            </div>
            
          </div>
        )}

      </main>
    </div>
  );
}
