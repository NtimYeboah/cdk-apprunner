import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Duration } from "aws-cdk-lib";
import config from './config';

export class RdsResourceStack extends cdk.Stack {
    readonly vpc: ec2.Vpc;
    readonly dbSecurityGroup: ec2.SecurityGroup;
    readonly rdsInstance: rds.DatabaseInstance;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.vpc = this.provisionVpc();
        this.dbSecurityGroup = this.provisionSecurityGroup(this.vpc);
        this.rdsInstance = this.provisionRds(this.vpc, this.dbSecurityGroup);
    }

    private provisionVpc() {
        return new ec2.Vpc(this, `${this.stackName}-Vpc`, {
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            maxAzs: 3,
            subnetConfiguration: [
                {
                    cidrMask: 20,
                    name: "PrivateWithEgress",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    cidrMask: 20,
                    name: "PrivateIsolated",
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
                {
                    cidrMask: 20,
                    name: "Public",
                    subnetType: ec2.SubnetType.PUBLIC,
                }
            ],
        });
    }

    private provisionSecurityGroup(vpc: ec2.Vpc) {
        const dbInstanceSg = new ec2.SecurityGroup(this, `${this.stackName}-rds-sg`, {
            vpc,
            allowAllOutbound: true,
            description: "Ingress for MySQL Server",
        });
        dbInstanceSg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(3306)
        );

        return dbInstanceSg;
    }

    private provisionRds(vpc: ec2.Vpc, dbInstanceSg: ec2.SecurityGroup) {
        return new rds.DatabaseInstance(this, `${this.stackName}-mysql-rds`, {
            engine: rds.DatabaseInstanceEngine.mysql({
                version: rds.MysqlEngineVersion.VER_8_0
            }),
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE3,
                config.rdsInstanceType(),
            ),
            credentials: rds.Credentials.fromGeneratedSecret(this.stackName, {
                secretName: config.rdsCredentialsSecretName(),
            }),
            vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
            allocatedStorage: config.rdsAllocatedStorage(),
            databaseName: config.rdsDatabaseName(),
            autoMinorVersionUpgrade: config.rdsAutoMinorVersionUpgrade(),
            allowMajorVersionUpgrade: config.rdsAutoMajorVersionUpgrade(),
            securityGroups: [dbInstanceSg],
            multiAz: config.rdsMultiAz(),
            backupRetention: Duration.days(5),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            storageEncrypted: true,
        });
    }
}
