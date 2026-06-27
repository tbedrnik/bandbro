import { api } from '@frontend/api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/songs/search')({
	component: RouteComponent,
})

function RouteComponent() {
	const query = useQuery(api.songs.get.queryOptions({}))

	return <div>
		<div>{query.status}</div>
		{query.data?.map(song => (
			<div key={song.id}>{song.name}</div>
		))}
	</div>
}
