import { api } from '@frontend/api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/songs/$slug')({
	component: RouteComponent,
})

function RouteComponent() {
	const { slug } = Route.useParams()
	const query = useQuery(api.songs({ slug }).get.queryOptions({}))

	return <div>
		<div>{query.status}</div>
		<div>{query.data?.name}</div>
		<div>{query.data?.organization?.name}</div>
		{query.data?.charts.map(chart => (
			<div key={chart.id}>{chart.content} - {chart.organization?.name}</div>
		))}
		{query.data?.credits.map(credit => (
			<div key={`${credit.artist.id}-${credit.role}`}>{credit.artist.name} - {credit.role}</div>
		))}
	</div>
}
