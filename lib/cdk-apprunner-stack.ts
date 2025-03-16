import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import config from './config';

export interface CdkApprunnerStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  rdsInstance: rds.DatabaseInstance;
}

export class CdkApprunnerStack extends cdk.Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: CdkApprunnerStackProps) {
    super(scope, id, props);

    this.repository = this.provisionEcr();
    const appRunnerECRRole = this.provisionAppRunnerECRRole();
    const appRunnerInstanceRole = this.provisionAppRunnerInstanceRole(props.rdsInstance);
    const vpcConnector = this.provisionVpcConnector(props.vpc);
    const appRunnerService = this.provisionAppRunnerService(appRunnerECRRole, appRunnerInstanceRole, vpcConnector);

    // Apprunner service output
    new cdk.CfnOutput(this, "serviceUrl", {
      value: appRunnerService.attrServiceUrl,
      exportName: "serviceUrl",
    });
  }

  private provisionEcr() {
    return new ecr.Repository(this, `${this.stackName}-Repository`, {
      repositoryName: config.ecrRepositoryName(),
      imageScanOnPush: config.ecrScanImageOnPush(),
      removalPolicy: cdk.RemovalPolicy.DESTROY, // or cdk.RemovalPolicy.RETAIN (option)
    });
  }

  private provisionAppRunnerECRRole() {
    const ecrRole = new iam.Role(this, `${this.stackName}-apprunner-ecr-role`, {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      description: `${this.stackName}-apprunner-ecr-role`,
    });

    ecrRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ecr:GetAuthorizationToken"],
      resources: [
        `arn:aws:ecr:${this.region}:${this.repository.repositoryUri}`
      ],
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
        `arn:aws:ecr:${this.region}:${this.repository.repositoryUri}`
      ],
    }));

    return ecrRole;
  }

  private provisionAppRunnerInstanceRole(rdsInstance: rds.DatabaseInstance) {
    const instanceRole = new iam.Role(this, `${this.stackName}-apprunner-instance-role`, {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: `${this.stackName}-apprunner-instance-role`,
    });

    rdsInstance.secret?.encryptionKey?.grantDecrypt(instanceRole);
    rdsInstance.secret?.grantRead(instanceRole);

    return instanceRole;
  }

  private provisionVpcConnector(vpc: ec2.Vpc) {

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

  private provisionAppRunnerService(appRunnerECRRole: iam.Role, appRunnerInstanceRole: iam.Role, vpcConnector: apprunner.CfnVpcConnector) {
    return new apprunner.CfnService(this, `${this.stackName}-apprunner-service`, {
      serviceName: config.apprunnerServiceName(),
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerECRRole.roleArn,
        },
        autoDeploymentsEnabled: true,
        imageRepository: {
          imageIdentifier: `arn:aws:ecr:${this.region}:${this.repository.repositoryUri}:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: config.apprunnerImagePort(),
          },
        },
      },
      instanceConfiguration: {
        cpu: config.apprunnerInstanceCpu(),
        memory: config.apprunnerInstanceMemory(),
        instanceRoleArn: appRunnerInstanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: "TCP",
        timeout: config.apprunnerHealthCheckTimeout(),
        interval: config.apprunnerHealthCheckInterval(),
        unhealthyThreshold: config.apprunnerHealthCheckUnhealthyThreshold(),
        healthyThreshold: config.apprunnerHealthCheckHealthyThreshold(),
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
