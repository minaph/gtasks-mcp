import {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { GaxiosResponse } from "gaxios";
import { tasks_v1 } from "googleapis";

const MAX_TASK_RESULTS = 100;

export class TaskResources {
  static async read(request: ReadResourceRequest, tasks: tasks_v1.Tasks) {
    const taskId = request.params.uri.replace("gtasks:///", "");

    const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
      await tasks.tasklists.list({
        maxResults: MAX_TASK_RESULTS,
      });

    const taskLists = taskListsResponse.data.items || [];
    let task: tasks_v1.Schema$Task | null = null;

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const taskResponse: GaxiosResponse<tasks_v1.Schema$Task> =
            await tasks.tasks.get({
              tasklist: taskList.id,
              task: taskId,
            });
          task = taskResponse.data;
          break;
        } catch (error) {
          // Task not found in this list, continue to the next one
        }
      }
    }

    if (!task) {
      throw new Error("Task not found");
    }

    return task;
  }

  static async list(
    request: ListResourcesRequest,
    tasks: tasks_v1.Tasks,
  ): Promise<[tasks_v1.Schema$Task[], string | null]> {
    const pageSize = 10;
    const params: any = {
      maxResults: pageSize,
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }

    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];

    let allTasks: tasks_v1.Schema$Task[] = [];
    let nextPageToken = null;

    for (const taskList of taskLists) {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        ...params,
      });

      const taskItems = tasksResponse.data.items || [];
      allTasks = allTasks.concat(taskItems);

      if (tasksResponse.data.nextPageToken) {
        nextPageToken = tasksResponse.data.nextPageToken;
      }
    }

    return [allTasks, nextPageToken];
  }
}

export class TaskActions {
  private static formatTask(task: tasks_v1.Schema$Task) {
    return `${task.title}\n (Due: ${task.due || "Not set"}) - Notes: ${task.notes} - ID: ${task.id} - Status: ${task.status} - URI: ${task.selfLink} - Hidden: ${task.hidden} - Parent: ${task.parent} - Deleted?: ${task.deleted} - Completed Date: ${task.completed} - Position: ${task.position} - Updated Date: ${task.updated} - ETag: ${task.etag} - Links: ${task.links} - Kind: ${task.kind}}`;
  }

  private static formatTaskList(taskList: tasks_v1.Schema$Task[]) {
    return taskList.map((task) => this.formatTask(task)).join("\n");
  }

  private static async _list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    let allTasks: tasks_v1.Schema$Task[] = [];

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id,
            maxResults: MAX_TASK_RESULTS,
          });

          const items = tasksResponse.data.items || [];
          allTasks = allTasks.concat(items);
        } catch (error) {
          console.error(`Error fetching tasks for list ${taskList.id}:`, error);
        }
      }
    }
    return allTasks;
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskTitle) {
      throw new Error("Task title is required");
    }

    const task = {
      title: taskTitle,
      notes: taskNotes,
      due: taskDue,
    };

    const taskResponse = await tasks.tasks.insert({
      tasklist: taskListId,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task created: ${taskResponse.data.title}`,
        },
      ],
      isError: false,
    };
  }

  static async update(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskUri = request.params.arguments?.uri as string;
    const taskId = request.params.arguments?.id as string;
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskUri) {
      throw new Error("Task URI is required");
    }

    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const task = {
      id: taskId,
      title: taskTitle,
      notes: taskNotes,
      status: taskStatus,
      due: taskDue,
    };

    const taskResponse = await tasks.tasks.update({
      tasklist: taskListId,
      task: taskUri,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task updated: ${taskResponse.data.title}`,
        },
      ],
      isError: false,
    };
  }

  static async list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const allTasks = await this._list(request, tasks);
    const taskList = this.formatTaskList(allTasks);

    return {
      content: [
        {
          type: "text",
          text: `Found ${allTasks.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async delete(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;

    if (!taskId) {
      throw new Error("Task URI is required");
    }

    await tasks.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task ${taskId} deleted`,
        },
      ],
      isError: false,
    };
  }

  static async search(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const userQuery = request.params.arguments?.query as string;

    const allTasks = await this._list(request, tasks);
    const filteredItems = allTasks.filter(
      (task) =>
        task.title?.toLowerCase().includes(userQuery.toLowerCase()) ||
        task.notes?.toLowerCase().includes(userQuery.toLowerCase()),
    );

    const taskList = this.formatTaskList(filteredItems);

    return {
      content: [
        {
          type: "text",
          text: `Found ${allTasks.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async clear(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";

    await tasks.tasks.clear({
      tasklist: taskListId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Tasks from tasklist ${taskListId} cleared`,
        },
      ],
      isError: false,
    };
  }

  static async listTaskLists(
    request: CallToolRequest,
    tasks: tasks_v1.Tasks,
  ): Promise<CallToolResult> {
    const pageSizeArg = request.params.arguments?.pageSize as number | undefined;
    const cursorArg = request.params.arguments?.cursor as string | undefined;

    const maxResults = typeof pageSizeArg === "number" && pageSizeArg > 0
      ? pageSizeArg
      : MAX_TASK_RESULTS;

    const params: tasks_v1.Params$Resource$Tasklists$List = {
      maxResults,
    } as tasks_v1.Params$Resource$Tasklists$List;

    if (cursorArg) {
      (params as any).pageToken = cursorArg;
    }

    const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
      await tasks.tasklists.list(params as any);

    const taskLists = taskListsResponse.data.items || [];
    const nextCursor = taskListsResponse.data.nextPageToken || null;

    const formatted = taskLists
      .map((list) => {
        const title = list.title || "Untitled";
        const id = list.id || "Unknown";
        const updated = list.updated || "Unknown";
        return `Title: ${title} - ID: ${id} - Updated: ${updated}`;
      })
      .join("\n");

    const header = `Found ${taskLists.length} task lists:`;
    const footer = nextCursor ? `\nnextCursor: ${nextCursor}` : "";

    return {
      content: [
        {
          type: "text",
          text: `${header}${taskLists.length ? "\n" : ""}${formatted}${footer}`,
        },
      ],
      isError: false,
    };
  }
}
