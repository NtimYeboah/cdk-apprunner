#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkApprunnerStack } from '../lib/cdk-apprunner-stack';
import { RdsResourceStack } from '../lib/rds-resource-stack';
import config from '../lib/config';

const app = new cdk.App();

new RdsResourceStack(app, 'RdsResourceStack', {
    env: {
        account: "651706758333",//config.accountId(),
        region: "us-east-1",//config.region()
    },
});

//new CdkApprunnerStack(app, 'CdkApprunnerStack', {
  //vpc: rdsResourceStack.vpc,
  //dbSecurityGroup: rdsResourceStack.dbSecurityGroup,
  //rdsInstance: rdsResourceStack.rdsInstance
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  //env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  //env: {
    //account: getConfig().ACCOUNT,
    //region: getConfig().REGION,
 // },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
//}).addDependency(rdsResourceStack);