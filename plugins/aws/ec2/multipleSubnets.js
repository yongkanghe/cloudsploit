var async = require('async');
var helpers = require('../../../helpers/aws');

module.exports = {
    title: 'VPC Multiple Subnets',
    category: 'EC2',
    domain: 'Compute',
    description: 'Ensures that VPCs have multiple subnets to provide a layered architecture',
    more_info: 'VPCs should be designed to have separate public and private subnets, ideally across availability zones, enabling a DMZ-style architecture.',
    link: 'https://docs.aws.amazon.com/AmazonVPC/latest/UserGuide/VPC_Subnets.html#SubnetSecurity',
    recommended_action: 'Create at least two subnets in each VPC, utilizing one for public traffic and the other for private traffic.',
    apis: ['EC2:describeVpcs', 'EC2:describeSubnets', 'STS:getCallerIdentity'],
    realtime_triggers: ['ec2:CreateVpc', 'ec2:CreateSubnet', 'ec2:DeleteSubnet'],

    run: function(cache, settings, callback) {
        var results = [];
        var source = {};
        var regions = helpers.regions(settings);

        var acctRegion = helpers.defaultRegion(settings);
        var awsOrGov = helpers.defaultPartition(settings);
        var accountId = helpers.addSource(cache, source, ['sts', 'getCallerIdentity', acctRegion, 'data']);

        async.each(regions.ec2, function(region, rcb){
            var describeVpcs = helpers.addSource(cache, source,
                ['ec2', 'describeVpcs', region]);

            if (!describeVpcs) return rcb();

            if (describeVpcs.err || !describeVpcs.data) {
                helpers.addResult(results, 3,
                    'Unable to query for VPCs: ' + helpers.addError(describeVpcs), region);
                return rcb();
            }

            if (!describeVpcs.data.length) {
                helpers.addResult(results, 0, 'No VPCs found', region);
                return rcb();
            }

            if (describeVpcs.data.length > 1) {
                helpers.addResult(results, 0,
                    'Multiple (' + describeVpcs.data.length + ') VPCs are used.', region);
                return rcb();
            }

            var vpcId = describeVpcs.data[0].VpcId;

            if (!vpcId) {
                helpers.addResult(results, 3, 'Unable to query for subnets for VPC.', region);
                return rcb();
            }

            var describeSubnets = helpers.addSource(cache, source,
                ['ec2', 'describeSubnets', region, vpcId]);

            if (!describeSubnets || describeSubnets.err || !describeSubnets.data || !describeSubnets.data.Subnets) {
                helpers.addResult(results, 3,
                    'Unable to query for subnets in VPC: ' + helpers.addError(describeSubnets), region, vpcId);
                return rcb();
            }

            var resource = 'arn:' + awsOrGov + ':ec2:' + region + ':' + accountId + ':vpc/' + vpcId;

            if (describeSubnets.data.Subnets.length > 1) {
                helpers.addResult(results, 0,
                    'There are ' + describeSubnets.data.Subnets.length + ' subnets used in one VPC.',
                    region, resource);
            } else if (describeSubnets.data.Subnets.length === 1) {
                helpers.addResult(results, 2,
                    'Only one subnet (' + describeSubnets.data.Subnets[0].SubnetId + ') in one VPC is used.',
                    region, resource);
            } else {
                helpers.addResult(results, 0,
                    'The VPC does not contain any subnets',
                    region, resource);
            }

            rcb();
        }, function(){
            callback(null, results, source);
        });
    }
};