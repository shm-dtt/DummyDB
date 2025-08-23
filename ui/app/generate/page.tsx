"use client"

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Database, Save, AlertCircle } from "lucide-react";

const formSchema = z.object({
  databaseType: z.enum(["sql", "nosql", "graph"]),
  sqlFile: z
    .instanceof(File)
    .refine((file) => file.type === "text/plain" || file.name.endsWith('.sql'), {
      message: "Please upload a valid SQL file (.sql or text file)",
    })
    .refine((file) => file.size > 0, {
      message: "File cannot be empty",
    })
    .optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function GeneratePage() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      databaseType: "sql",
    },
  });

  const selectedDbType = form.watch("databaseType");

  const onSubmit = async (data: FormData) => {
    if (data.databaseType !== "sql" || !data.sqlFile) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", data.sqlFile);

      const response = await fetch(
        "http://localhost:8000/api/v1/parse?save_to_disk=true&overwrite_existing=false",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      setUploadSuccess(true);
      form.reset();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="font-sans min-h-screen flex flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col items-center justify-center text-center gap-8 px-4">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-2">Generate Data</h1>
        <p className="text-lg max-w-xl text-muted-foreground mb-6">
          Use the form below to generate mock data for your database.
        </p>
        
        <div className="w-full max-w-md">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Database Type Selection */}
              <FormField
                control={form.control}
                name="databaseType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Database Type
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select database type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sql">SQL</SelectItem>
                        <SelectItem value="nosql">NoSQL</SelectItem>
                        <SelectItem value="graph">Graph</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* SQL File Upload - Only show for SQL database type */}
              {selectedDbType === "sql" && (
                <FormField
                  control={form.control}
                  name="sqlFile"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        SQL File
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".sql,text/plain"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            onChange(file);
                          }}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Not Supported Message for non-SQL databases */}
              {selectedDbType !== "sql" && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {selectedDbType === "nosql" 
                      ? "NoSQL database support is coming soon!" 
                      : "Graph database support is coming soon!"}
                  </AlertDescription>
                </Alert>
              )}

              {/* Submit Button - Only show for SQL database type */}
              {selectedDbType === "sql" && (
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isUploading || !form.watch("sqlFile")}
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save to Backend
                    </>
                  )}
                </Button>
              )}

              {/* Success Message */}
              {uploadSuccess && (
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <AlertDescription>
                    File uploaded successfully to the backend!
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Message */}
              {uploadError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {uploadError}
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
} 