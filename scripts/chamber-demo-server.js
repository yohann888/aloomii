#!/usr/bin/env node
'use strict';

// Production-safe entry wrapper for the ChamberCore demo server.
// Keeps the first hosted pass simple while avoiding local-only naming in deployment docs/processes.

require('./chamber-demo-local');
