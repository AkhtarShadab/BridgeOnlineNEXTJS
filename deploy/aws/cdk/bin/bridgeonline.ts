#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BridgeOnlineStack } from "../lib/bridgeonline-stack";

const app = new cdk.App();

new BridgeOnlineStack(app, "BridgeOnlineRedisVoice", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // ap-south-1 keeps Redis near this project's Supabase pooler (aws-1-ap-south-1).
    region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
  },
  description:
    "BridgeOnline friends-play stack: EC2 (Next+Socket+coturn) + ElastiCache Redis + Secrets",
});
