import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Duration } from "aws-cdk-lib";

export class RdsResourceStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly dbSecurityGroup: ec2.SecurityGroup;
    public readonly rdsInstance: rds.DatabaseInstance;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.vpc = this.provisionVpc();
        this.dbSecurityGroup = this.provisionSecurityGroup(this.vpc);
        this.rdsInstance = this.provisionRds(this.vpc, this.dbSecurityGroup);
    }

    provisionVpc() {
        return new ec2.Vpc(this, `${this.stackName}-vpc`, {
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            maxAzs: 3,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: "private",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    cidrMask: 24,
                    name: "public",
                    subnetType: ec2.SubnetType.PUBLIC,
                }
            ],
        });
    }

    provisionSecurityGroup(vpc: ec2.Vpc)
    {
        const dbServerSG = new ec2.SecurityGroup(this, `${this.stackName}-rds-sg`, {
            vpc,
            allowAllOutbound: true,
            description: "Ingress for MySQL Server",
        });
        dbServerSG.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(3306)
        );

        return dbServerSG;
    }

    provisionRds(vpc: ec2.Vpc, dbServerSG: ec2.SecurityGroup) {
        return new rds.DatabaseInstance(this, `${this.stackName}-mysql-rds`, {
            engine: rds.DatabaseInstanceEngine.mysql({
                version: rds.MysqlEngineVersion.VER_8_0
            }),
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE3,
                ec2.InstanceSize.MICRO
            ),
            credentials: rds.Credentials.fromGeneratedSecret('cdkapprunner', {
                secretName: `rds/dev/cdkapprunner/mysql`, // Make this an env
            }),
            vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            databaseName: 'l_12_apprunner', // Make this an env
            autoMinorVersionUpgrade: false,
            allowMajorVersionUpgrade: false,
            securityGroups: [dbServerSG],
            multiAz: false, // Make this an env;
            backupRetention: Duration.days(5), // Make this an env
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            storageEncrypted: true,
        });
    }
}
