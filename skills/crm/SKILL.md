# CRM Skill

This skill provides the agent with CRM (Customer Relationship Management) capabilities.

## Capabilities

- **Search Contacts**: Find contacts by name, email, company, or tags
- **Get Contact Details**: Retrieve full contact profile with activity history
- **Create/Update Contacts**: Add new contacts or update existing ones
- **Manage Deals**: Create, update, and move deals through pipeline stages
- **Log Activities**: Record calls, emails, meetings, and notes against contacts or deals
- **Search Deals**: Find deals by title, stage, value, or assigned user
- **Lead Management**: Create and qualify leads, convert to contacts/deals

## Tools

### search_contacts
Search the CRM contact database.
- **Parameters**: `query` (string), `workspace_id` (string, optional), `limit` (number, default 10)
- **Returns**: Array of matching contacts with basic info

### get_contact
Get full details for a specific contact.
- **Parameters**: `contact_id` (string)
- **Returns**: Contact object with related deals, activities, and conversations

### create_contact
Create a new contact in the CRM.
- **Parameters**: `first_name`, `last_name`, `email`, `phone`, `company_name`, `source`
- **Returns**: Created contact object

### get_deal
Get deal details including pipeline stage.
- **Parameters**: `deal_id` (string)
- **Returns**: Deal object with pipeline, stage, contact, and activity info

### update_deal_stage
Move a deal to a different pipeline stage.
- **Parameters**: `deal_id` (string), `stage_id` (string)
- **Returns**: Updated deal object

### log_activity
Log an activity (call, email, meeting, note) against a contact or deal.
- **Parameters**: `type` (call|email|meeting|note|task), `subject`, `body`, `contact_id`, `deal_id`
- **Returns**: Created activity object

### search_deals
Search deals by various criteria.
- **Parameters**: `query` (string), `status` (open|won|lost), `pipeline_id`, `limit`
- **Returns**: Array of matching deals

## Context

The agent should use these tools when users ask about customers, deals, sales pipeline,
or need to log interactions. Always confirm before creating or modifying records.
