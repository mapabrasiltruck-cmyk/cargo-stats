{
  "targets": [
    {
      "target_name": "telemetry-addon",
      "sources": [ "src/telemetry-addon.cpp" ],
      "include_dirs": [
        "../node_modules/node-addon-api",
        "src"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "WarningLevel": 3,
          "TreatWarningAsError": "false"
        },
        "VCLinkerTool": {
          "GenerateDebugInformation": "false"
        }
      }
    }
  ]
}
