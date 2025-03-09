// Dependencies
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Create a new client instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ] 
});

// Bot configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Webhook configuration - map table names to their corresponding webhook URLs
const WEBHOOKS = {
  tf2_rgl_seasons: process.env.WEBHOOK_RGL_SEASONS,
  // Add more webhooks for other tables as needed
};

// Command definitions
const commands = [
  {
    name: 'update',
    description: 'Update a database table with new data',
    options: [
      {
        name: 'table',
        type: 3, // STRING type
        description: 'The table to update',
        required: true,
        choices: [
          { name: 'TF2 RGL Seasons', value: 'tf2_rgl_seasons' },
          // Add more table choices as needed
        ]
      },
      {
        name: 'id',
        type: 4, // INTEGER type
        description: 'ID of the record to add or update',
        required: true
      }
    ]
  }
  // Additional commands can be added here
];

// Register commands when the bot starts
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

// Event listeners
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'update') {
    const table = interaction.options.getString('table');
    const id = interaction.options.getInteger('id');
    
    // Check if webhook exists for the selected table
    if (!WEBHOOKS[table]) {
      await interaction.reply({
        content: `Error: Table '${table}' is not configured for updates.`,
        ephemeral: true
      });
      return;
    }
    
    try {
      // Acknowledge the interaction first to avoid timeout
      await interaction.deferReply();
      
      // Initial feedback to user that request is being processed
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🔄 Processing Update Request')
            .setDescription(`Request to update table \`${table}\` with ID \`${id}\` has been submitted.`)
            .setColor(0xFFA500) // Orange for "in progress"
            .addFields({ name: 'Status', value: 'Waiting for backend workflow to complete...', inline: true })
            .setTimestamp()
        ]
      });
      
      // Send request to webhook and wait for the complete response
      console.log(`Sending request to webhook for table ${table} with ID ${id}`);
      const response = await axios.post(WEBHOOKS[table], {
        table: table,
        id: id,
        user: {
          id: interaction.user.id,
          username: interaction.user.username,
          tag: `${interaction.user.username}#${interaction.user.discriminator || '0'}`,
          globalName: interaction.user.globalName || interaction.user.username
        }
      });
      
      // Log the full response data
      console.log("Full response from webhook:", JSON.stringify(response.data, null, 2));
      
      // Check for empty response
      if (!response.data || 
          (Array.isArray(response.data) && response.data.length === 0) ||
          (typeof response.data === 'object' && Object.keys(response.data).length === 0)) {
        
        // Handle empty response
        console.warn("Received empty response from webhook");
        
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Update Request Issue')
              .setDescription('The workflow completed but returned no response data.')
              .addFields({ name: 'Suggestion', value: 'Please check the backend workflow for errors or missing response nodes.' })
              .setColor(0xFF0000) // Red for errors
              .setTimestamp()
          ]
        });
        
        return; // Exit early
      }
      
      // Process the response from webhook
      let message = "Request processed.";
      let success = true;  // Default to success unless we determine otherwise
      
      // Extract the message from the array format
      if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].message) {
        message = response.data[0].message;
        
        // Basic heuristic to detect success/failure based on message content
        // Adjust these conditions based on your actual message patterns
        if (message.toLowerCase().includes("error") || 
            message.toLowerCase().includes("failed") ||
            message.toLowerCase().includes("not found")) {
          success = false;
        }
      } else if (response.data.message) {
        // Fallback for direct object format if needed
        message = response.data.message;
      }
      
      // Create a generic response embed
      const resultEmbed = new EmbedBuilder()
        .setTitle('Update Request Completed')
        .setDescription(`Request to update table \`${table}\` with ID \`${id}\` has finished processing.`)
        .setColor(success ? 0x00FF00 : 0xFFA500) // Green for success, Orange for info
        .setTimestamp();
      
      // Add the message from webhook directly in the description field
      resultEmbed.setDescription(message);
      
      // Update the reply with the final status
      await interaction.editReply({ embeds: [resultEmbed] });
      
    } catch (error) {
      console.error('Error processing update:', error);
      
      // Determine if we have a response from webhook but it contained an error
      let errorMessage = 'There was an error processing your request.';
      
      // Try to extract error message from response if available
      if (error.response && error.response.data) {
        if (Array.isArray(error.response.data) && error.response.data.length > 0) {
          errorMessage = error.response.data[0].message || errorMessage;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message || errorMessage;
        }
      }
      
      // Log the full error for debugging
      console.error('Error response:', error.response ? error.response.data : 'No response data');
      
      // Send error message to user
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Update Failed')
            .setDescription(errorMessage)
            .setColor(0xFF0000) // Red for errors
            .setTimestamp()
        ]
      });
    }
  }
  // Additional commands can be handled here
});

// Login to Discord
client.login(TOKEN);
