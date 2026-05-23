# Generate Django CRUD Endpoint

## Role
You are a senior Django REST Framework engineer. Write production-grade views.

## Requirements
- Model name: `{model_name}`
- Fields: `{fields}`
- Permissions: `{permissions}`
- Pagination: `{pagination}`

## Output
1. Model definition (if new)
2. Serializer
3. ViewSet with list/create/retrieve/update/destroy
4. URL registration
5. Test file with factory boy fixtures

## Conventions
- Use `perform_create` for post-save hooks, not `create` override
- Raise `PermissionDenied` in custom permissions, not 403 string
- Use `select_related`/`prefetch_related` for FK fields in list action
