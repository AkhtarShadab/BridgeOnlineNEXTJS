import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

/**
 * Dev-sized BridgeOnline host with Redis (ElastiCache) + voice (coturn on EC2).
 *
 * Keeps Postgres on existing Supabase (inject DATABASE_URL / DIRECT_URL into the secret).
 * Skips ALB/NAT to stay within AWS credits (~$15–35/mo before TURN bandwidth).
 */
export class BridgeOnlineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const appSg = new ec2.SecurityGroup(this, "AppSg", {
      vpc,
      description: "BridgeOnline EC2 — HTTPS, Socket.io, TURN",
      allowAllOutbound: true,
    });
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH (lock to your IP after first login)");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP (Caddy ACME / redirect)");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS + WSS");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3478), "TURN TCP");
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(3478), "TURN UDP");
    appSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udpRange(49152, 49200),
      "TURN relay range (narrow for credits; widen if needed)",
    );

    const redisSg = new ec2.SecurityGroup(this, "RedisSg", {
      vpc,
      description: "ElastiCache Redis — app SG only",
      allowAllOutbound: false,
    });
    redisSg.addIngressRule(appSg, ec2.Port.tcp(6379), "Redis from app");

    const subnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnets", {
      description: "BridgeOnline Redis",
      subnetIds: vpc.publicSubnets.map((s) => s.subnetId),
      cacheSubnetGroupName: "bridgeonline-redis",
    });

    const redis = new elasticache.CfnCacheCluster(this, "Redis", {
      engine: "redis",
      cacheNodeType: "cache.t4g.micro",
      numCacheNodes: 1,
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
      vpcSecurityGroupIds: [redisSg.securityGroupId],
      engineVersion: "7.1",
    });
    redis.addDependency(subnetGroup);

    // Placeholder secret — replace string values in console before first boot,
    // or update via CLI after synth/deploy.
    const appSecret = new secretsmanager.Secret(this, "AppSecret", {
      secretName: "bridgeonline/app",
      description: "BridgeOnline runtime secrets (Supabase + NextAuth + TURN)",
      secretObjectValue: {
        DATABASE_URL: cdk.SecretValue.unsafePlainText(
          "postgresql://postgres.PROJECT:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
        ),
        DIRECT_URL: cdk.SecretValue.unsafePlainText(
          "postgresql://postgres.PROJECT:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
        ),
        NEXTAUTH_SECRET: cdk.SecretValue.unsafePlainText("REPLACE_WITH_openssl_rand_base64_32"),
        TURN_SECRET: cdk.SecretValue.unsafePlainText("REPLACE_WITH_long_random_string"),
      },
    });

    const role = new iam.Role(this, "AppRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });
    appSecret.grantRead(role);

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euxo pipefail",
      "dnf update -y || yum update -y",
      "dnf install -y docker coturn jq amazon-ssm-agent || yum install -y docker coturn jq",
      "systemctl enable --now docker amazon-ssm-agent || true",
      "usermod -aG docker ec2-user || true",
      "",
      "# coturn — static-auth-secret must match Secrets Manager TURN_SECRET",
      "cat >/etc/coturn/turnserver.conf <<'EOF'",
      "listening-port=3478",
      "fingerprint",
      "lt-cred-mech",
      "use-auth-secret",
      "static-auth-secret=REPLACE_ME_AFTER_SECRET_UPDATE",
      "realm=bridgeonline",
      "no-multicast-peers",
      "no-cli",
      "min-port=49152",
      "max-port=49200",
      "EOF",
      "systemctl enable --now coturn || true",
      "",
      "mkdir -p /opt/bridgeonline",
      "cat >/opt/bridgeonline/README.txt <<'EOF'",
      "1. Update Secrets Manager bridgeonline/app with real Supabase + NEXTAUTH + TURN secrets.",
      "2. Set coturn static-auth-secret to the same TURN_SECRET and restart coturn.",
      "3. Clone AWSDep, copy deploy/aws/env.aws.template to .env, fill REDIS_URL from stack output,",
      "   TURN_URL=turn:<ElasticIP>:3478?transport=udp, enable FEATURE_VOICE_CHAT.",
      "4. npm ci --legacy-peer-deps && npx prisma generate && npm run build && npm run start:all",
      "   (or docker pull/build from repo Dockerfile with NEXT_PUBLIC_FEATURE_VOICE_CHAT=true).",
      "5. Put Caddy/nginx in front for HTTPS; point NEXTAUTH_URL at that host.",
      "EOF",
    );

    const instance = new ec2.Instance(this, "AppHost", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: appSg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(30, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    const eip = new ec2.CfnEIP(this, "AppEip", {
      domain: "vpc",
      instanceId: instance.instanceId,
      tags: [{ key: "Name", value: "bridgeonline-app" }],
    });

    new cdk.CfnOutput(this, "ElasticIp", {
      value: eip.attrPublicIp,
      description: "Public IP for HTTPS / TURN_URL",
    });
    new cdk.CfnOutput(this, "RedisPrimaryEndpoint", {
      value: redis.attrRedisEndpointAddress,
      description: "Set REDIS_URL=redis://<this>:6379",
    });
    new cdk.CfnOutput(this, "SecretArn", {
      value: appSecret.secretArn,
      description: "Update DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, TURN_SECRET",
    });
    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
      description: "SSM Session Manager target",
    });
    new cdk.CfnOutput(this, "SuggestedTurnUrl", {
      value: cdk.Fn.join("", [
        "turn:",
        eip.attrPublicIp,
        ":3478?transport=udp",
      ]),
      description: "Paste into TURN_URL on the host",
    });
  }
}
