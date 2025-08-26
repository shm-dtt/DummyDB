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
import { Upload, Database, Save, AlertCircle, FileText, Table, Plus, Trash2, ArrowRight } from "lucide-react";

const formSchema = z.object({
  databaseType: z.enum(["sql", "nosql", "graph"]),
  sqlFile: z
    .instanceof(File)
    .refine((file) => file.type === "text/plain" || file.name.endsWith('.sql'), {
      message: "Please upload a valid SQL file (.sql or text file)",
    })
    .refine((file) => file.size > 0, {
      message: "File cannot be empty",
    }),
  seedDataFile: z
    .instanceof(File)
    .refine((file) => file.type === "text/plain" || file.type === "text/csv" || file.name.endsWith('.sql') || file.name.endsWith('.csv'), {
      message: "Please upload a valid file (.sql or .csv)",
    })
    .refine((file) => file.size > 0, {
      message: "File cannot be empty",
    })
    .optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TableAttribute {
  name: string;
  type: string;
  constraints: string[];
  type_params?: string;
}

interface Table {
  name: string;
  attributes: TableAttribute[];
}

interface Database {
  name: string;
  tables: Table[];
}

interface ApiResponse {
  databases: Database[];
}

interface EncryptionConfig {
  id: string;
  tableName: string;
  attribute: string;
  algorithm: string;
}

const ENCRYPTION_ALGORITHMS = [
  "AES-256",
  "AES-128", 
  "RSA-2048",
  "RSA-4096",
  "ChaCha20",
  "Twofish",
  "Blowfish",
  "DES",
  "3DES"
];

export default function GeneratePage() {
  const [currentStep, setCurrentStep] = useState<"upload" | "configure">("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [databaseStructure, setDatabaseStructure] = useState<ApiResponse | null>(null);
  const [tableEntryCounts, setTableEntryCounts] = useState<Record<string, number>>({});
  const [enableEncryption, setEnableEncryption] = useState(false);
  const [encryptionConfigs, setEncryptionConfigs] = useState<EncryptionConfig[]>([
    { id: "1", tableName: "", attribute: "", algorithm: "" }
  ]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      databaseType: "sql",
    },
  });

  const selectedDbType = form.watch("databaseType");

  const handleTableEntryCountChange = (tableName: string, count: string) => {
    const numCount = parseInt(count) || 0;
    setTableEntryCounts(prev => ({
      ...prev,
      [tableName]: numCount
    }));
  };

  const handleEncryptionChange = (id: string, field: keyof EncryptionConfig, value: string) => {
    setEncryptionConfigs(prev => 
      prev.map(config => 
        config.id === id ? { ...config, [field]: value } : config
      )
    );
  };

  const addEncryptionRow = () => {
    const newId = (encryptionConfigs.length + 1).toString();
    setEncryptionConfigs(prev => [
      ...prev,
      { id: newId, tableName: "", attribute: "", algorithm: "" }
    ]);
  };

  const removeEncryptionRow = (id: string) => {
    if (encryptionConfigs.length > 1) {
      setEncryptionConfigs(prev => prev.filter(config => config.id !== id));
    }
  };

  const onSubmit = async (data: FormData) => {
    if (data.databaseType !== "sql") {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    setDatabaseStructure(null);

    try {
      const formData = new FormData();
      
      // Add SQL file if present
      if (data.sqlFile) {
        formData.append("file", data.sqlFile);
      }
      
      // Add seed data file if present
      if (data.seedDataFile) {
        formData.append("seed_data_file", data.seedDataFile);
      }

      const response = await fetch(
        "http://localhost:8000/v1/parse?save_to_disk=true&overwrite_existing=true",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      // Check if response contains database structure
      if (responseData.data) {
        // Parse the JSON string from the 'data' field
        const parsedData = JSON.parse(responseData.data);
        setDatabaseStructure(parsedData);
        
        // Initialize default entry counts for each table
        const defaultCounts: Record<string, number> = {};
        parsedData.databases.forEach((db: Database) => {  // ✅ Use parsedData instead
          db.tables.forEach((table: Table) => {
            defaultCounts[table.name] = 10; // Default to 10 entries
          });
        });
        setTableEntryCounts(defaultCounts);
        
        // Move to configuration step
        setCurrentStep("configure");
      }

      setUploadSuccess(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateData = async () => {
    if (!databaseStructure) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const generateData = {
        databaseStructure: databaseStructure,
        tableEntryCounts: tableEntryCounts,
        encryption: enableEncryption ? encryptionConfigs : null
      };

      const response = await fetch(
        "http://localhost:8000/v1/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(generateData),
        }
      );

      if (!response.ok) {
        throw new Error(`Data generation failed: ${response.statusText}`);
      }

      setUploadSuccess(true);
      // Reset to first step
      setCurrentStep("upload");
      setDatabaseStructure(null);
      setTableEntryCounts({});
      setEnableEncryption(false);
      setEncryptionConfigs([{ id: "1", tableName: "", attribute: "", algorithm: "" }]);
      form.reset();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Data generation failed");
    } finally {
      setIsUploading(false);
    }
  };

  const resetToUpload = () => {
    setCurrentStep("upload");
    setDatabaseStructure(null);
    setTableEntryCounts({});
    setEnableEncryption(false);
    setEncryptionConfigs([{ id: "1", tableName: "", attribute: "", algorithm: "" }]);
    setUploadSuccess(false);
    setUploadError(null);
    form.reset();
  };

  // Get unique table names for encryption dropdowns
  const getTableNames = () => {
    if (!databaseStructure) return [];
    const tableNames: string[] = [];
    databaseStructure.databases.forEach(db => {
      db.tables.forEach(table => {
        tableNames.push(table.name);
      });
    });
    return tableNames;
  };

  // Get attributes for a specific table
  const getTableAttributes = (tableName: string) => {
    if (!databaseStructure) return [];
    for (const db of databaseStructure.databases) {
      for (const table of db.tables) {
        if (table.name === tableName) {
          return table.attributes.map(attr => attr.name);
        }
      }
    }
    return [];
  };

  return (
    <div className="font-sans min-h-screen flex flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col items-center justify-center text-center gap-8 px-4">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-2">Generate Data</h1>
        <p className="text-lg max-w-xl text-muted-foreground mb-6">
          Use the form below to generate mock data for your database.
        </p>
        
        <div className="w-full max-w-4xl">
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className={`flex items-center ${currentStep === "upload" ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${currentStep === "upload" ? "border-primary bg-primary text-primary-foreground" : "border-muted"}`}>
                1
              </div>
              <span className="ml-2 font-medium">Upload Files</span>
            </div>
            <div className="mx-4">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className={`flex items-center ${currentStep === "configure" ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${currentStep === "configure" ? "border-primary bg-primary text-primary-foreground" : "border-muted"}`}>
                2
              </div>
              <span className="ml-2 font-medium">Configure & Generate</span>
            </div>
          </div>

          {/* First Form: File Upload and Parsing */}
          {currentStep === "upload" && (
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
                          SQL File (Required)
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

                {/* Seed Data File Upload - Only show for SQL database type */}
                {selectedDbType === "sql" && (
                  <FormField
                    control={form.control}
                    name="seedDataFile"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Seed Data (Optional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".sql,.csv,text/plain,text/csv"
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
                        Parsing Files...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Parse Files & Continue
                      </>
                    )}
                  </Button>
                )}
              </form>
            </Form>
          )}

          {/* Second Form: Table Configuration and Encryption */}
          {currentStep === "configure" && databaseStructure && (
            <div className="space-y-6">
              <div className="text-left">
                <h2 className="text-2xl font-bold mb-4">Database Structure & Configuration</h2>
                
                {/* Database Structure Display */}
                {databaseStructure.databases.map((db, dbIndex) => (
                  <div key={dbIndex} className="mb-6 p-4 border rounded-lg">
                    <h3 className="text-xl font-semibold mb-3 text-primary">
                      Database: {db.name}
                    </h3>
                    <div className="space-y-4">
                      {db.tables.map((table, tableIndex) => (
                        <div key={tableIndex} className="p-3 border rounded-md bg-muted/30">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-lg font-medium flex items-center gap-2">
                              <Table className="h-4 w-4" />
                              Table: {table.name}
                            </h4>
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium">
                                Number of entries:
                              </label>
                              <Input
                                type="number"
                                min="1"
                                value={tableEntryCounts[table.name] || 10}
                                onChange={(e) => handleTableEntryCountChange(table.name, e.target.value)}
                                className="w-20"
                              />
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p className="mb-2">Attributes:</p>
                            <ul className="space-y-1">
                              {table.attributes.map((attr, attrIndex) => (
                                <li key={attrIndex} className="flex items-center gap-2">
                                  <span className="font-mono text-xs bg-background px-2 py-1 rounded">
                                    {attr.name}
                                  </span>
                                  <span className="text-xs">({attr.type}{attr.type_params ? `(${attr.type_params})` : ''})</span>
                                  {attr.constraints.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      [{attr.constraints.join(', ')}]
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Encryption Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold mb-3">Encryption Configuration</h3>
                  
                  {/* Encryption Enable/Disable Radio Buttons */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="encryption"
                          value="no"
                          checked={!enableEncryption}
                          onChange={() => setEnableEncryption(false)}
                          className="text-primary"
                        />
                        <span>No Encryption</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="encryption"
                          value="yes"
                          checked={enableEncryption}
                          onChange={() => setEnableEncryption(true)}
                          className="text-primary"
                        />
                        <span>Enable Encryption</span>
                      </label>
                    </div>
                  </div>

                  {/* Encryption Configuration Rows */}
                  {enableEncryption && (
                    <div className="space-y-4 mt-4">
                      <div className="text-sm text-muted-foreground">
                        Configure which table attributes should be encrypted and with which algorithm:
                      </div>
                      
                      {encryptionConfigs.map((config, index) => (
                        <div key={config.id} className="flex items-center gap-3 p-3 border rounded-md bg-muted/20">
                          <div className="flex-1">
                            <Select
                              value={config.tableName}
                              onValueChange={(value) => handleEncryptionChange(config.id, 'tableName', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Table" />
                              </SelectTrigger>
                              <SelectContent>
                                {getTableNames().map((tableName) => (
                                  <SelectItem key={tableName} value={tableName}>
                                    {tableName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Select
                              value={config.attribute}
                              onValueChange={(value) => handleEncryptionChange(config.id, 'attribute', value)}
                              disabled={!config.tableName}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Attribute" />
                              </SelectTrigger>
                              <SelectContent>
                                {config.tableName && getTableAttributes(config.tableName).map((attrName) => (
                                  <SelectItem key={attrName} value={attrName}>
                                    {attrName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Select
                              value={config.algorithm}
                              onValueChange={(value) => handleEncryptionChange(config.id, 'algorithm', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Algorithm" />
                              </SelectTrigger>
                              <SelectContent>
                                {ENCRYPTION_ALGORITHMS.map((algo) => (
                                  <SelectItem key={algo} value={algo}>
                                    {algo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeEncryptionRow(config.id)}
                            disabled={encryptionConfigs.length === 1}
                            className="shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addEncryptionRow}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add Encryption Row
                      </Button>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetToUpload}
                    className="flex-1"
                  >
                    Back to Upload
                  </Button>
                  <Button 
                    onClick={handleGenerateData}
                    className="flex-1"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Generating Data...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Generate Mock Data
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {uploadSuccess && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <AlertDescription>
                {currentStep === "upload" 
                  ? "Files parsed successfully! Please configure your tables and encryption settings." 
                  : "Data generated successfully!"}
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
        </div>
      </main>
    </div>
  );
} 