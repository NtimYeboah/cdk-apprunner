import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as apprunner from "aws-cdk-lib/aws-apprunner";

export interface CdkApprunnerStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  rdsInstance: rds.DatabaseInstance;
}

export class CdkApprunnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkApprunnerStackProps) {
    super(scope, id, props);

    const appRunnerECRRole = this.provisionAppRunnerECRRole(props.rdsInstance);
    const appRunnerInstanceRole = this.provisionAppRunnerInstanceRole(props.rdsInstance);
    const vpcConnector = this.provisionVpcConnector(props.vpc);
    const appRunnerService = this.provisionAppRunnerService(appRunnerECRRole, appRunnerInstanceRole, vpcConnector, props.rdsInstance);

    // Apprunner service output
    new cdk.CfnOutput(this, "serviceUrl", {
      value: appRunnerService.attrServiceUrl,
      exportName: "serviceUrl",
    });

  }

  provisionAppRunnerECRRole(rdsInstance: rds.DatabaseInstance) {
    const ecrRole = new iam.Role(this, `${this.stackName}-apprunner-ecr-role`, {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      description: `${this.stackName}-apprunner-ecr-role`,
    });

    ecrRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    }));

    ecrRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetRepositoryPolicy",
        "ecr:DescribeRepositories",
        "ecr:ListImages",
        "ecr:DescribeImages",
        "ecr:BatchGetImage",
        "ecr:GetLifecyclePolicy",
        "ecr:GetLifecyclePolicyPreview",
        "ecr:ListTagsForResource",
        "ecr:DescribeImageScanFindings",
      ],
      resources: [
        "arn:aws:ecr:" + this.region + ":" + this.account + ":repository/laravel12-apprunner",
      ],
    }));

    return ecrRole;
  }

  provisionAppRunnerInstanceRole(rdsInstance: rds.DatabaseInstance) {
    const instanceRole = new iam.Role(this, `${this.stackName}-apprunner-instance-role`, {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: `${this.stackName}-apprunner-instance-role`,
    });

    rdsInstance.secret?.encryptionKey?.grantDecrypt(instanceRole);
    rdsInstance.secret?.grantRead(instanceRole);

    return instanceRole;
  }

  provisionVpcConnector(vpc: ec2.Vpc) {

    const vpcResourceSG = new ec2.SecurityGroup(this, `${this.stackName}-vpc-connector-sg`, {
        vpc,
        allowAllOutbound: true,
        description: "Ingress for all traffic",
    });
    vpcResourceSG.addIngressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock),
        ec2.Port.allTraffic(),
    );
    
    return new apprunner.CfnVpcConnector(this, "vpcConnector", {
      subnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnetIds,
      securityGroups: [vpcResourceSG.securityGroupId],
    });
  }

  provisionAppRunnerService(appRunnerECRRole: iam.Role, appRunnerInstanceRole: iam.Role, vpcConnector: apprunner.CfnVpcConnector, rdsInstance: rds.DatabaseInstance) {
    return new apprunner.CfnService(this, `${this.stackName}-apprunner-service`, {
      serviceName: "cdk-apprunner", //this.appName,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerECRRole.roleArn,
        },
        autoDeploymentsEnabled: true,
        imageRepository: {
          imageIdentifier: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/laravel12-apprunner:507a50414e66af4c55051a948362c71191affdd9`, //`${this.account}.dkr.ecr.${this.region}.amazonaws.com/${this.appName}:latest`, // Change to Reposity
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "80",
          },
        },
      },
      instanceConfiguration: {
        cpu: "1 vCPU",
        memory: "2 GB",
        instanceRoleArn: appRunnerInstanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: "TCP",
        timeout: 3,
        interval: 5,
        unhealthyThreshold: 3,
        healthyThreshold: 1
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
    });
  }
}
