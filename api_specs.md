# Sending the user query from frontend to backend
{
    'type' : 'query',
    'contents' : 'what is the name of his father'
}

# Response from the backend
## Top k (5) closest memories retrieved from the memory database

{
    'type' : 'response',
    'contents' : 'The name of his father is John Doe.'
    'memories' : 
        {
            'mem-id' : 5,
            'text' : 'The name of his father is John Doe.'
            'x':-34.5,
            'y' : 12.3
        }
        {
            'mem-id' : 5,
            'text' : 'The name of his father is John Doe.'
            'x':-34.5,
            'y' : 12.3
        }
        {
            'mem-id' : 5,
            'text' : 'The name of his father is John Doe.'
            'x':-34.5,
            'y' : 12.3
        }
        {
            'mem-id' : 5,
            'text' : 'The name of his father is John Doe.'
            'x':-34.5,
            'y' : 12.3
        }
        {
            'mem-id' : 5,
            'text' : 'The name of his father is John Doe.'
            'x':-34.5,
            'y' : 12.3
        }

}

# Detective notes progress check
## the actual contents are gonna be probabaly bigger in size
{
    'type': 'progress_check',
    'progress_check_id':1
    'contents': 'The protagonist has successfully retrieved the name of his father from the memory database'
}


# Progress check response from the backend
{
    'type': 'progress_check_response',
    'progress_check_id':1,
    'progress_check_status': 50
}

- 'progress_check_status': 50 (out of 100)