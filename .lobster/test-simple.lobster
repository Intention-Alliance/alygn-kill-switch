name: test-simple
description: Simple test workflow

steps:
  - id: step1
    command: echo 'Project: testproject'
    description: "Test variable substitution"
    output:
      file: /tmp/test-step1.txt

  - id: step2
    command: node scripts/x-growth/load-project.js --project=testproject
    description: "Load test project"
    after: step1
    output:
      file: /tmp/test-step2.json
