const line = require('@line/bot-sdk');


const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

async function getProfile(source) {
    try {
        if (source.type === 'user') return await client.getProfile(source.userId);
        if (source.type === 'group') return await client.getGroupMemberProfile(source.groupId, source.userId);
        return { displayName: 'Unknown' };
    } catch (e) { 
        return { displayName: 'Unknown' }; 
    }
}

module.exports = { client, getProfile };